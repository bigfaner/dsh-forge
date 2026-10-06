// e2e 宿主启动支撑层（fix-37 ① 收编）——launchHost（boot 就绪链 + 端口分配 + userData
// 管理）+ closeApp（进程退出等待 + 2s 静置——全员强制，吸收 fix-34③止血）单源。
//
// 分叉以参数承载并注取舍（review 裁决形态）：
// - dismiss：任何收起动作（点击「稍后配置」/Esc）写 dsh 侧客户态，同 userData 下一 boot
//   存在产品工作台挂载竞态（7/7 复现，dismiss 毒化——p1mvp e2e 纪律）→ RPC-only 前置段
//   传 dismiss:false（模态在场不阻塞 evaluate，仅拦指针），收起置于链路末段 UI boot。
// - providerOverlay：复启链路防毒化（provider 可服务 = API-key 弹窗不挂载）；单 boot
//   纯 UI 走查面不必（dismiss 兜底）——comp/kb/pr 沿用，sw/krf/hero 不用。
// - stablePhase：'wait'（30s 相位稳定门——常态）| 'probe'（复启链路 60s 逐拍留痕探针
//   ——comp 形态：settle 慢尾诊断）| 'none'（hero-control：相位由调用侧按项目态断言）。
// - timeouts：安装形态慢盘 120s（缺省 60/90/60）。
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type ElectronApplication, type Page } from '@playwright/test'
import { allocatePort } from './ports.js'
import { dismissOnboardingModals } from './modals.js'
import { writeProviderOverlay } from './dogfood.js'
import { WORKBENCH } from './anchors.js'

/** 仓库根（e2e/support/launch.ts 文件面 → 上三级：文件段 + support + e2e。
 *  fix-37 抽层时误减一级（join 是文本段运算，文件自身占一段）——ROOT 落在 e2e/ 使
 *  HOST_DIR 指向不存在目录，launchElectron 的 spawn cwd 非法 → 全体 electron 走查
 *  `spawn cmd.exe ENOENT` 即时失败（fix-40 勘察实证，回迁母本三段口径）。 */
export const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
export const HOST_DIR = join(ROOT, 'apps', 'host')

/** electron 二进制（apps/host 依赖闭包解析——pnpm 隔离布局根 node_modules 无 electron） */
export const electronBinary = createRequire(join(HOST_DIR, 'package.json'))('electron') as unknown as string

// ─── 原始启动面（壳级/harness 形态：host-boot/web-shell/installer-pipeline/安装套件） ───

export interface RawLaunchOptions {
  /** 安装产物 exe（缺省 dev electron + apps/host cwd） */
  readonly executablePath?: string
  readonly cwd?: string
  readonly args?: readonly string[]
  /** 追加 env（TEMP/TMP 重定向、RESOURCES_DIR、MATERIALIZE_ONLY 等；端口缺省经分配器） */
  readonly env?: Record<string, string>
  /** 缺省 allocatePort()——显式传入仅在 harness 自管端口形态 */
  readonly port?: number
}

/** 薄宿主原始启动（不做就绪链——调用侧自定义等待面） */
export async function launchElectron(opts: RawLaunchOptions = {}): Promise<ElectronApplication> {
  const { _electron } = await import('@playwright/test')
  const installed = opts.executablePath !== undefined && opts.executablePath !== electronBinary
  return _electron.launch({
    executablePath: opts.executablePath ?? electronBinary,
    ...(installed ? {} : { args: [...(opts.args ?? ['.'])], cwd: opts.cwd ?? HOST_DIR }),
    env: {
      ...process.env,
      DSH_FORGE_PORT: String(opts.port ?? allocatePort()),
      ...opts.env,
    } as Record<string, string>,
  })
}

// ─── 就绪链族 ───

/** 壳 boot 就绪链：就绪门 → 模块系统 live → 产品插件激活标记 */
export async function waitShellReady(
  page: Page,
  timeouts: { readonly bootReady?: number; readonly loaderLive?: number } = {},
): Promise<void> {
  await page.waitForFunction(
    () => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined,
    undefined,
    { timeout: timeouts.bootReady ?? 60_000 },
  )
  await page.waitForFunction(
    () => {
      const g = globalThis as { __ModuleLoader__?: { mode: string }; __DSH_FORGE_CLIENT__?: unknown }
      return g.__ModuleLoader__?.mode === 'live' && g.__DSH_FORGE_CLIENT__ !== undefined
    },
    undefined,
    { timeout: timeouts.loaderLive ?? 90_000 },
  )
}

/** 相位稳定门返回形态 */
export type WorkbenchPhase = 'hero' | 'session'

/** 相位稳定门（settling 收敛——hero/session 二态；waitForFunction 30s 形态） */
export async function stablePhase(page: Page, timeoutMs = 30_000): Promise<WorkbenchPhase> {
  await page.waitForFunction(
    () => {
      const p = document.querySelector('[data-dswf-workbench]')?.getAttribute('data-dswf-phase')
      return p === 'hero' || p === 'session'
    },
    undefined,
    { timeout: timeoutMs },
  )
  return page.locator(WORKBENCH).first().getAttribute('data-dswf-phase') as Promise<WorkbenchPhase>
}

/** 工作台桥导航（fix-25：官方面板径——showSession = layout.selectPanel(null) 回官方
 *  会话面板；无产品会话行期的载体适配，台账口径保持） */
export async function bridgeDispatch(page: Page, type: string): Promise<void> {
  await page.evaluate((eventType) => {
    const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: { showSession(): void } }).__DSH_FORGE_WORKBENCH__
    if (eventType === 'show-session') bridge?.showSession()
  }, type)
}

// ─── 组合启动面（16 specs 主形态） ───

export interface LaunchHostOptions {
  /** 隔离 userData（e2e 单实例纪律——调用侧 mkdtemp 创建、finally 清理） */
  readonly userData: string
  /** boot 叠层路径（DSH_FORGE_PATCH_FILES——dogfood 模型叠层等） */
  readonly overlay?: string
  /** 是否收起官方首启引导模态（缺省 true；RPC-only 前置段传 false——毒化面，见头注） */
  readonly dismiss?: boolean
  /** 向导走查归回退面（缺省 off——fix-14：OS 对话框不可 e2e，preload 桥降级开关） */
  readonly directoryPickerOff?: boolean
  /** dev profile 掌舵（缺省 true——安装形态 exe 自掌舵传 false） */
  readonly devProfile?: boolean
  /** provider 叠层（复启链路防毒化：API-key 弹窗预免——comp/kb/pr 形态） */
  readonly providerOverlay?: boolean
  /** 相位稳定门形态（缺省 'wait'；'probe' = 复启链路 60s 逐拍留痕；'none' = 调用侧自管） */
  readonly stablePhase?: 'wait' | 'probe' | 'none'
  /** 稳定后相位断言（如 fresh 零项目 boot 断 hero——pr 形态） */
  readonly expectPhase?: WorkbenchPhase
  /** console 收集（缺省 false——comp 诊断形态：末 60 条环形缓冲） */
  readonly collectConsole?: boolean
  /** 安装产物 exe（缺省 dev electron） */
  readonly executablePath?: string
  /** 追加 env（TEMP/TMP 重定向等） */
  readonly env?: Record<string, string>
  /** 就绪链超时（安装形态慢盘 120s；缺省 60/90/60——firstWindow 缺省 playwright 30s：
   *  bootDshHost（child spawn + profile 装配）先于首窗，内存受限/慢盘环境首窗可越 30s） */
  readonly timeouts?: {
    readonly firstWindow?: number
    readonly bootReady?: number
    readonly loaderLive?: number
    readonly workbenchVisible?: number
  }
}

export interface Launched {
  readonly app: ElectronApplication
  readonly page: Page
  /** renderer 未捕获异常（pageerror 面——多数套件终态断言空） */
  readonly pageErrors: string[]
  /** console 环形缓冲（仅 collectConsole:true——相位稳定探针诊断面） */
  readonly consoleTail: string[]
  /** 本启动写入的叠层路径（providerOverlay:true 时在场——finally 清理责任在调用侧） */
  readonly overlayPath?: string
}

/** 组合启动：env 装配 → 就绪链 → 工作台可见 → 模态处置（可选）→ 相位稳定门 */
export async function launchHost(opts: LaunchHostOptions): Promise<Launched> {
  const {
    userData,
    overlay,
    dismiss = true,
    directoryPickerOff = true,
    devProfile = true,
    providerOverlay = false,
    stablePhase: settleMode = 'wait',
    expectPhase,
    collectConsole = false,
    executablePath,
    env,
    timeouts,
  } = opts
  const overlayPath = providerOverlay ? writeProviderOverlay() : undefined
  const app = await launchElectron({
    executablePath,
    env: {
      ...(devProfile ? { DSH_FORGE_DEV_PROFILE: 'dev' } : {}),
      ...(overlay === undefined ? {} : { DSH_FORGE_PATCH_FILES: overlay }),
      ...(overlayPath === undefined ? {} : { DSH_FORGE_PATCH_FILES: overlayPath }),
      DSH_FORGE_USER_DATA: userData,
      ...(directoryPickerOff ? { DSH_FORGE_DIRECTORY_PICKER: 'off' } : {}),
      ...env,
    },
  })
  const page = await app.firstWindow({ timeout: timeouts?.firstWindow })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  const consoleTail: string[] = []
  if (collectConsole) {
    page.on('console', (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`
      consoleTail.push(text.slice(0, 300))
      if (consoleTail.length > 60) consoleTail.shift()
    })
  }
  await waitShellReady(page, timeouts)
  await expect(page.locator(WORKBENCH).first()).toBeVisible({
    timeout: timeouts?.workbenchVisible ?? 60_000,
  })
  if (dismiss) await dismissOnboardingModals(page)
  if (settleMode === 'probe') {
    // 复启链路相位稳定门（60s 采样轮询 + 逐拍留痕——comp 形态：settle 收敛偶有慢尾）
    const settleDeadline = Date.now() + 60_000
    for (;;) {
      const probe = await page.evaluate(() => ({
        phase: document.querySelector('[data-dswf-workbench]')?.getAttribute('data-dswf-phase') ?? null,
        workbenchCount: document.querySelectorAll('[data-dswf-workbench]').length,
        bodyText: document.body.innerText.slice(0, 200),
        rootHtmlLen: document.getElementById('root')?.innerHTML.length ?? -1,
        clientLive: (globalThis as { __DSH_FORGE_CLIENT__?: unknown }).__DSH_FORGE_CLIENT__ !== undefined,
        loaderMode: (globalThis as { __ModuleLoader__?: { mode: string } }).__ModuleLoader__?.mode ?? null,
      }))
      if (probe.phase === 'hero' || probe.phase === 'session') break
      if (Date.now() > settleDeadline) {
        throw new Error(
          `相位稳定超时（60s）：phase=${String(probe.phase)} workbench=${String(probe.workbenchCount)} clientLive=${String(probe.clientLive)} loader=${String(probe.loaderMode)} rootLen=${String(probe.rootHtmlLen)} windows=${String(app.windows().length)} body=${probe.bodyText}\nconsoleTail=${consoleTail.slice(-25).join(' || ')}`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
  } else if (settleMode === 'wait') {
    await stablePhase(page)
  }
  if (expectPhase !== undefined) {
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', expectPhase, {
      timeout: 30_000,
    })
  }
  return { app, page, pageErrors, consoleTail, overlayPath }
}

/**
 * 关闭宿主并等待主进程退出 + 2s 静置（句柄/端口复用竞态防护——既有 specs 同源；
 * fix-34 止血形态，fix-37 收编单源——全员强制消费，禁止裸 app.close()）。
 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  const proc = app.process()
  await app.close().catch(() => undefined)
  if (proc.exitCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000)
      proc.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}
