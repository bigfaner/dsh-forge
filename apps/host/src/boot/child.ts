// dsh 宿主 boot 子进程入口（fix-1 child 形态；定位：基础）。
// 形态：ELECTRON_RUN_AS_NODE=1 --expose-internals 子进程（官方 Desktop 同款；由
// run.ts spawn，母本 = S1 spike main.mjs run3）。动机：direct-in-main 形态 boot
// 可跑但 agent 工具派发恒挂起（4.2 dogfood 插桩实证），修复方向 = boot 切 child 形态。
// 职责：argv 收 BootDshOptions JSON → loadProfileDirectory → boot overlay →
// runProfile（direct 形态原路径原序，整体平移）→ ready 消息面世
// {url, injections, 六服务在场位（P1 双服务 + M2 四域）}；随后常驻应答 rpc（bridge.dispatchRpc）与
// shutdown（ProcessShutdown.shutdown(0)——有界 5s 升级强退自带）。
// boot 链模块实例经 boot-chain.ts 统一解析（fix-20：dev 形态与插件树同拷贝，
// 消 bootstrapIncludes WeakMap 分裂——见该文件动机）。
// 以下 type-only 引入仅为拉入 cordis Context 模块增强（ctx.connection / ctx.webServer 类型）
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
// mobile-remote-approval fix-2：ctx.approval 具名服务类型（disc-1 配方——type-only import
// 官方包 + 运行期存在性检查承担 fail-soft；禁 ctx.reflect.get 丢类型取法）
import type {} from '@deepseek-ai/dsh-user-approval'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import {
  approvalWaterfallAnswer,
  createApprovalRelay,
  dispatchRpc,
  extraPatchFiles,
  parseChildOptions,
  sendGuarded,
  type ApprovalRelay,
  type BridgeServiceName,
  type ChildToMainMessage,
  type MainToChildMessage,
} from './bridge.js'
import { loadBootChain } from './boot-chain.js'
import { writeBootOverlay } from './overlay.js'
import { lanIpv4Of } from './manifest.js'
import { loadPresetPatches } from '../profile/presets.js'

/** cordis ctx 的服务解析窄面（reflect.provide 的逆查询；真 Context.get 结构兼容） */
interface ServiceGetFace {
  get(name: string): unknown
}

/** 官方 ToolRuntime 的结构化窄面（tools 服务——dsh-tools Service，super(ctx, "tools") 注册名） */
interface ToolRuntimeFace {
  schemas(scope?: unknown): readonly { readonly name?: unknown }[]
}

/** ToolRuntime 已注册 tool 名全集（全局视图；读取/形状异常 = undefined 观测降级不抛） */
function toolNamesOf(face: ServiceGetFace): readonly string[] | undefined {
  try {
    const tools = face.get('tools') as ToolRuntimeFace | undefined
    if (tools === undefined || typeof tools.schemas !== 'function') return undefined
    return tools
      .schemas()
      .map((s) => (typeof s.name === 'string' ? s.name : ''))
      .filter((name) => name !== '')
  } catch {
    return undefined
  }
}

// fix-33 ① send 防护：IPC 序列化抛错（BigInt/循环引用）不落 unhandled rejection——
// rpc-result 面回填保 id 降级 error-result（主侧 pending 可结算）。见 bridge.sendGuarded。
const send = (message: ChildToMainMessage): void => {
  sendGuarded(message, (m) => process.send?.(m))
}

// 消息处理器换芯位：ready 面世前静默丢弃（主侧约定不先发——ready 收到前无 rpc/shutdown），
// boot 完成后置换为真处理器；listen 常驻不拆（消息零丢失窗）。
let handleMessage: (message: MainToChildMessage) => void = () => {}
process.on('message', (message: unknown) => {
  handleMessage(message as MainToChildMessage)
})

// 主进程消亡（IPC 断开）→ 有界优雅关停（已 boot：ProcessShutdown.shutdown 自带 5s
// 升级强退；未 boot：直接退出——不留孤儿 webserver 持端口）。
let shutdownTree: (() => Promise<void>) | undefined
process.on('disconnect', () => {
  // fix-36：拒绝面补 catch——shutdown 链 reject 不落 unhandled rejection（仅记日志；
  // 5s 强退升级若也已失效，孤儿回收归 OS 进程树清理，不再额外改退出码）
  if (shutdownTree !== undefined) {
    void shutdownTree().catch((error: unknown) => {
      console.error('[boot-child] shutdown 关停失败', error)
    })
  } else process.exit(0)
})

/**
 * 手机远程暴露开关装配期读数（fix-3）：直读 forge-settings.json 顶层 remoteApproval.enabled
 * （严格 === true 才开——畸形值 = 关；文件缺席/读失败 = 关 fail-soft）。只读不建文件不抛
 * （装配期失败不阻 boot——远程暴露缺省回环形制）。
 */
function remoteApprovalEnabledOf(settingsFile: string | undefined): boolean {
  if (settingsFile === undefined) return false
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsFile, 'utf8'))
    const section = (parsed as Record<string, unknown> | null)?.['remoteApproval']
    return (section as Record<string, unknown> | undefined)?.['enabled'] === true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const options = parseChildOptions(process.argv)
  if (options === undefined) {
    send({ type: 'fatal', message: 'boot child：argv[2] 缺席/非法 BootDshOptions JSON（spawn 约定见 run.ts）' })
    process.exitCode = 1
    return
  }
  const { dshAppBoot, runProfile } = await loadBootChain(options.profileDir)
  const profile = dshAppBoot.loadProfileDirectory('dsh', options.profileDir, options.installAnchor)
  dshAppBoot.reportSkippedBundles('dsh', profile)
  // 产品插件行 config 装配期注入（用户层之后应用的 patchFiles 叠层——见 overlay.ts 动机）
  // M3 3.7 预设装配：三底稿（presets/）+ 双技能目录物化锚入同一 overlay——预设行每启
  // 注行产品工件（customSkillDirs 物化当形态绝对路径）；底稿缺席 fail-soft 不注行。
  // 产品裁决（2026-10-09）：skillsDir 仅作预设 customSkillDirs[core] 物化锚——无全局
  // skill-filesystem 行（forge 技能/工具仅预设组合，标准模式零 forge 面）。
  const presetPatches = loadPresetPatches()
  // mobile-remote-approval fix-3（重启生效形态）：手机远程暴露开关 = 产品自有配置
  // forge-settings.json 的 remoteApproval.enabled（官方 remote.settings 无 webserver 可写
  // 命名空间且拒绝运行期 rebind——开关写产品配置，宿主装配期读之决定绑定，下次启动生效）。
  // 直读文件（core forgeSettings 服务尚未装配——本进程 runProfile 之前唯一读缝）；文件
  // 缺席/畸形 = 未开启（fail-soft 默认回环形制）。
  const remoteExpose = remoteApprovalEnabledOf(options.settingsFile)
  const overlayPath = writeBootOverlay(join(dirname(options.stateDb), 'boot-overlay.yml'), {
    stateDb: options.stateDb,
    bindingsFile: options.bindingsFile,
    tasksHome: options.tasksHome, // 3.4 M2 派生根（缺席 = core 四域降级——P1 面零变化）
    settingsFile: options.settingsFile, // M3 3.8 设置域存储（缺席 = forgeSettings 服务降级缺席）
    credentialsPath: options.credentialsPath, // fix-26 凭据桥（隔离态 undefined 不桥）
    remoteExpose, // fix-3 装配期绑定暴露缝（true = webserver 行覆写全卡绑定——重启生效）
    port: options.port, // fix-3 webserver 覆写行 port 字面量单源（boot 实参）
    ...(presetPatches !== undefined
      ? {
          presets: {
            ...presetPatches,
            coreSkillsDir: options.skillsDir, // customSkillDirs[core]（plugin-forge skills 同源）
            specSkillsDir: options.specSkillsDir, // customSkillDirs[spec]（缺席 = spec 技能面降级）
            bindingsFile: options.bindingsFile, // fix-1/drift #9：预设行内产品行 config 物化（与全局行同值单源）
          },
        }
      : {}),
  })
  const { ctx, shutdown: processShutdown } = await runProfile({
    environment: dshAppBoot.loadLayeredEnv('dsh'),
    profile: 'dsh-forge',
    resolvedProfile: { profile, installAnchor: options.installAnchor },
    patchFiles: [overlayPath, ...extraPatchFiles(process.env)],
    args: ['--no-open', '--port', String(options.port)],
  })
  const url = ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`)
  // fix-3：实际绑定 host（快照面单源——UI pending/listening 判读 = 产品配置意图 × 本值；
  // 经 ready 消息 → boot manifest 透传 renderer）
  const remoteHost = ctx.webServer.host
  // fix-5 官方配对地址：真宿主载体为自定 scheme（页面 location.hostname 非可达地址）——
  // 全卡绑定实况下由宿主构造 authenticatedUrl（LAN IPv4 + 端口 + Host 令牌）作 UI QR/
  // 地址行单源；回环绑定 / 无局域网 IPv4 = 缺席（UI 空态回退，不自造地址）。
  const lanIpv4 = lanIpv4Of(Object.values(networkInterfaces()))
  const remotePairUrl =
    remoteHost === '0.0.0.0' && lanIpv4 !== undefined
      ? ctx.connection.authenticatedUrl(`http://${lanIpv4}:${ctx.webServer.port}`)
      : undefined
  const injections = ctx.webServer.collectIndexInjections()
  const servicesFace = ctx as unknown as ServiceGetFace
  // mobile-remote-approval fix-2：官方审批桥 worker 侧（ctx.approval 在场才建中继——
  // 运行期存在性检查承担 fail-soft；缺席 = approval ready 位 false，main 侧转发器不接线，
  // forge:remote/approval 保持 fail-soft unavailable）。fail-open 语义（用户裁决
  // 2026-10-14）：approval/request waterfall 应答监听器在手机决策未命中时透传 next()
  // 放行桌面工作台 answerer——global 注册使其在任意 agent scope 的 waterfall 可达。
  let approvalRelay: ApprovalRelay | undefined
  try {
    const approval = ctx.approval
    if (approval !== undefined && typeof approval === 'object') {
      const relay = createApprovalRelay()
      ctx.on(
        'approval/request',
        (_req, next) => approvalWaterfallAnswer(relay, next),
        { global: true },
      )
      approvalRelay = relay
    }
  } catch {
    approvalRelay = undefined // 官方审批服务缺席/监听器注册失败 → 桥面降级不接线
  }
  const services: Partial<Record<BridgeServiceName, object>> = {
    forgeProjects: (servicesFace.get('forgeProjects') as object | undefined) ?? undefined,
    forgeKnowledge: (servicesFace.get('forgeKnowledge') as object | undefined) ?? undefined,
    // M2 四域（Interface 1–4；tasksHome 缺席时 core 不 provide——在场位 false，main 侧降级）
    forgeTasks: (servicesFace.get('forgeTasks') as object | undefined) ?? undefined,
    forgeFeatures: (servicesFace.get('forgeFeatures') as object | undefined) ?? undefined,
    forgeProposals: (servicesFace.get('forgeProposals') as object | undefined) ?? undefined,
    forgeDocs: (servicesFace.get('forgeDocs') as object | undefined) ?? undefined,
    // M3 3.8 设置域（settingsFile 缺席时 core 不 provide——独立缝降级，六服务形制不动）
    forgeSettings: (servicesFace.get('forgeSettings') as object | undefined) ?? undefined,
    // fix-bug bug 域（tasksHome 注入时 core provide——缺席 = bugs 面降级）
    forgeBugs: (servicesFace.get('forgeBugs') as object | undefined) ?? undefined,
    // fix-2 审批桥（官方 ctx.approval 在场时 provide 内存中继——缺席 = 审批转发面降级）
    approval: approvalRelay,
  }
  // 已注册 tool 名清单（3.4 冒烟观测面）：官方 ToolRuntime.schemas() 全局视图投影 name。
  // 读取失败 = 观测降级（tools 缺席），boot 本体不受阻——断言面由冒烟承载。
  const toolNames = toolNamesOf(servicesFace)
  send({
    type: 'ready',
    url,
    injections,
    remoteHost, // fix-3：实际绑定 host（装配期读 remoteApproval.enabled 的结果——UI 判读单源）
    ...(remotePairUrl !== undefined ? { remotePairUrl } : {}), // fix-5：官方配对地址（全卡绑定 × 局域网 IPv4 在场才透传）
    services: {
      forgeProjects: services.forgeProjects !== undefined,
      forgeKnowledge: services.forgeKnowledge !== undefined,
      forgeTasks: services.forgeTasks !== undefined,
      forgeFeatures: services.forgeFeatures !== undefined,
      forgeProposals: services.forgeProposals !== undefined,
      forgeDocs: services.forgeDocs !== undefined,
      forgeSettings: services.forgeSettings !== undefined,
      forgeBugs: services.forgeBugs !== undefined,
      approval: services.approval !== undefined,
    },
    ...(toolNames !== undefined ? { tools: toolNames } : {}),
  })
  shutdownTree = () => processShutdown.shutdown(0)
  handleMessage = (message) => {
    if (message?.type === 'shutdown') {
      void processShutdown.shutdown(0)
      return
    }
    if (message?.type === 'rpc') {
      void dispatchRpc(services, message).then(send)
    }
  }
}

main().catch((error: unknown) => {
  send({ type: 'fatal', message: String((error as Error)?.stack ?? error) })
  process.exitCode = 1
})
