// dsh 宿主 boot 子进程入口（fix-1 child 形态；定位：基础）。
// 形态：ELECTRON_RUN_AS_NODE=1 --expose-internals 子进程（官方 Desktop 同款；由
// run.ts spawn，母本 = S1 spike main.mjs run3）。动机：direct-in-main 形态 boot
// 可跑但 agent 工具派发恒挂起（4.2 dogfood 插桩实证），修复方向 = boot 切 child 形态。
// 职责：argv 收 BootDshOptions JSON → loadProfileDirectory → boot overlay →
// runProfile（direct 形态原路径原序，整体平移）→ ready 消息面世
// {url, injections, 双服务在场位}；随后常驻应答 rpc（bridge.dispatchRpc）与
// shutdown（ProcessShutdown.shutdown(0)——有界 5s 升级强退自带）。
// boot 链模块实例经 boot-chain.ts 统一解析（fix-20：dev 形态与插件树同拷贝，
// 消 bootstrapIncludes WeakMap 分裂——见该文件动机）。
// 以下 type-only 引入仅为拉入 cordis Context 模块增强（ctx.connection / ctx.webServer 类型）
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { dirname, join } from 'node:path'
import {
  dispatchRpc,
  extraPatchFiles,
  parseChildOptions,
  type BridgeServiceName,
  type ChildToMainMessage,
  type MainToChildMessage,
} from './bridge.js'
import { loadBootChain } from './boot-chain.js'
import { writeBootOverlay } from './overlay.js'

/** cordis ctx 的服务解析窄面（reflect.provide 的逆查询；真 Context.get 结构兼容） */
interface ServiceGetFace {
  get(name: string): unknown
}

const send = (message: ChildToMainMessage): void => {
  process.send?.(message)
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
  if (shutdownTree !== undefined) void shutdownTree()
  else process.exit(0)
})

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
  const overlayPath = writeBootOverlay(join(dirname(options.stateDb), 'boot-overlay.yml'), {
    stateDb: options.stateDb,
    bindingsFile: options.bindingsFile,
    credentialsPath: options.credentialsPath, // fix-26 凭据桥（隔离态 undefined 不桥）
  })
  const { ctx, shutdown: processShutdown } = await runProfile({
    environment: dshAppBoot.loadLayeredEnv('dsh'),
    profile: 'dsh-forge',
    resolvedProfile: { profile, installAnchor: options.installAnchor },
    patchFiles: [overlayPath, ...extraPatchFiles(process.env)],
    args: ['--no-open', '--port', String(options.port)],
  })
  const url = ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`)
  const injections = ctx.webServer.collectIndexInjections()
  const servicesFace = ctx as unknown as ServiceGetFace
  const services: Partial<Record<BridgeServiceName, object>> = {
    forgeProjects: (servicesFace.get('forgeProjects') as object | undefined) ?? undefined,
    forgeKnowledge: (servicesFace.get('forgeKnowledge') as object | undefined) ?? undefined,
  }
  send({
    type: 'ready',
    url,
    injections,
    services: {
      forgeProjects: services.forgeProjects !== undefined,
      forgeKnowledge: services.forgeKnowledge !== undefined,
    },
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
