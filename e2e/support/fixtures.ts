// e2e 共享 launch fixture（e2e-fast-shared-launch B2）——spec 级单次 launchHost +
// 用例间 tmp 夹具档案重播种 + 单用例 crash 自动重启续跑。
//
// 形态（Playwright test fixtures 既有机械直接复用——worker/test scope，无新自造机制；
// 官方 dsh 无 e2e fixture 机械可复用，本模块为 e2e 基座自属，自建记录「官方无此面」）：
//  - worker 级 auto fixture `sharedSession`：每 worker（= 每份 spec 串行执行单元）至多
//    一次 launchHost；userData 整 spec 共享，夹具工作区 tmp 目录整 spec 共享路径。
//  - test 级 fixture `sharedLaunch`：每个用例开始时——①crash/死亡检测（主进程退出 |
//    renderer 页面已关闭，任一判死）→ 自动重启 app（同 userData 复用注册态）+ 重播种 +
//    重新注册项目，后续用例继续执行；失败用例本身照记红（page 已死，断言自然失败——不吞
//    不掩饰；失败用例触发 worker 重建时，新 worker 会话自动启动同语义续跑）；②夹具重播种
//    （夹具档案子树 .dsh 重建——注册期宿主落盘的 .forge/.knowledge 台账不动）；③用例间 UI
//    残留收口（Escape 关断上用例遗留弹层——重播种只复位 tmp 档案态，renderer 态由本兜底）。
//  - 用例退出不做 closeApp（这是提速的本体：整 spec 只冷启一次/崩溃一次）；worker 收尾
//    统一 closeApp + tmp 清理。
// 复用核销：launchHost/closeApp/registerProject 全部取自既有单源（launch.js / rpc.js），零复制。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp, launchHost, type LaunchHostOptions } from './launch.js'
import { registerProject } from './rpc.js'

/** 共享 launch 配置（spec 侧经 createSharedLaunchFixture 传入） */
export interface SharedLaunchConfig {
  /** 夹具播种：把夹具档案写入给定工作区目录（首启/重播种/crash 重启三条路径统一走此函数
   *  ——同参播种保证「重播种后档案回到基准态」语义单一；重播种前本层只清 .dsh 子树） */
  readonly seedWorkspace: (dir: string) => void
  /** 项目注册名（registerProject name——账本行标识） */
  readonly workspaceName: string
  /** launchHost 透传选项（userData 由本层自管，调用侧不再传） */
  readonly launch?: Omit<LaunchHostOptions, 'userData'>
}

/** 共享会话句柄（用例消费面——page/app + 留痕计数） */
export interface SharedLaunchHandle {
  readonly page: Page
  readonly app: ElectronApplication
  /** renderer 未捕获异常（Launched.pageErrors 透传） */
  readonly pageErrors: string[]
  /** 夹具工作区目录（整 spec 共享路径，档案子树每用例重播种） */
  readonly wsDir: string
  /** launchHost 次数（AC 证据面：整份 spec = 1 + crash 重启次数） */
  readonly launchCount: number
  /** 重播种次数 */
  readonly reseedCount: number
}

/** 共享 launch 会话（worker 级持有——launch 一次，用例间重播种/crash 重启） */
export class SharedLaunchSession {
  private launched: { app: ElectronApplication; page: Page; pageErrors: string[] } | undefined
  private crashed = true // 首用例前视为「未在跑」→ beginTest 走启动路径
  private wsDirValue: string | undefined
  private userData: string | undefined
  private launchCountValue = 0
  private reseedCountValue = 0

  constructor(private readonly config: SharedLaunchConfig) {}

  get launchCount(): number {
    return this.launchCountValue
  }

  get reseedCount(): number {
    return this.reseedCountValue
  }

  /** 重播种：夹具档案子树重建（只清 .dsh——注册期宿主落盘的 .forge/.knowledge 台账产物
   *  不动）；首调时建目录 + userData */
  reseed(): void {
    if (this.wsDirValue === undefined) {
      this.wsDirValue = mkdtempSync(join(tmpdir(), 'dsh-forge-shared-launch-ws-'))
      this.userData = mkdtempSync(join(tmpdir(), 'dsh-forge-shared-launch-ud-'))
    } else {
      rmSync(join(this.wsDirValue, '.dsh'), { recursive: true, force: true })
    }
    this.config.seedWorkspace(this.wsDirValue)
    this.reseedCountValue++
    console.log(`[shared-launch] 重播种 #${String(this.reseedCountValue)}（${this.wsDirValue}）`)
  }

  /** launchHost（整 spec 单次；crash 重启复用同 userData） */
  private async launch(): Promise<void> {
    this.launched = await launchHost({ ...this.config.launch, userData: this.userData! })
    this.launchCountValue++
    this.crashed = false
    const proc = this.launched.app.process()
    proc.once('exit', () => {
      // 非收尾期退出（用例中途 kill/宿主崩）——下一用例 beginTest 检测后自动重启
      this.crashed = true
      this.launched = undefined
    })
    console.log(
      `[shared-launch] launchHost #${String(this.launchCountValue)}（pid=${String(proc.pid)} userData=${this.userData}）`,
    )
  }

  /** 用例开始：保证 app 在场（crash → 关残壳 + 重启 + 重播种 + 重注册）且夹具为基准态 */
  async beginTest(): Promise<void> {
    // crash/死亡检测（两面任一即判死）：主进程退出（exit 事件）| renderer 页面已关闭
    //（kill 只杀子树时主进程可能残留）
    if (this.launched !== undefined && (this.crashed || this.launched.page.isClosed())) {
      console.log('[shared-launch] 检测到 app 退出/页面关闭（上一用例 crash）——关闭残壳 + 自动重启 + 重播种 + 重注册')
      try {
        await closeApp(this.launched.app)
      } catch {
        /* 残壳关闭尽力而为 */
      }
      this.launched = undefined
      this.crashed = true
    }
    if (this.launched === undefined) {
      this.reseed()
      await this.launch()
      await registerProject(this.launched!.page, this.wsDirValue!, this.config.workspaceName)
      return
    }
    // app 在场：仅重播种（状态复位——无冷启）+ 用例间 UI 残留收口（上用例可能遗留打开的
    // Dialog/弹层——重播种只复位 tmp 档案态，renderer 态由本兜底关断，防下用例点击被遮罩拦截）
    await this.launched.page.keyboard.press('Escape').catch(() => undefined)
    this.reseed()
  }

  handle(): SharedLaunchHandle {
    if (this.launched === undefined) throw new Error('shared-launch: 会话未启动（beginTest 未调用）')
    return {
      page: this.launched.page,
      app: this.launched.app,
      pageErrors: this.launched.pageErrors,
      wsDir: this.wsDirValue!,
      launchCount: this.launchCountValue,
      reseedCount: this.reseedCountValue,
    }
  }

  /** worker 收尾：closeApp + tmp 清理（尽力而为——进程残留由 Job Object 整树回收兜底） */
  async dispose(): Promise<void> {
    if (this.launched !== undefined) {
      try {
        await closeApp(this.launched.app)
      } catch {
        /* 尽力而为 */
      }
      this.launched = undefined
    }
    if (this.userData !== undefined) rmSync(this.userData, { recursive: true, force: true })
    if (this.wsDirValue !== undefined) rmSync(this.wsDirValue, { recursive: true, force: true })
  }
}

export interface SharedLaunchFixtures {
  /** test 级：每用例重播种 + crash 检测自动重启后的会话句柄 */
  sharedLaunch: SharedLaunchHandle
}

export interface SharedLaunchWorkerFixtures {
  /** worker 级 auto：worker（= 一份 spec 的串行执行单元）生命周期一条会话 */
  sharedSession: SharedLaunchSession
}

/**
 * 共享 launch fixture 工厂：返回扩展 test（消费侧 expect 取自 @playwright/test 本体，
 * 本层零断言语义新增）。
 * - `sharedSession`（worker 级 auto）：worker 生命周期一条会话，收尾统一 dispose。
 * - `sharedLaunch`（test 级）：beginTest（重播种 + crash 检测自动重启）→ use 句柄 →
 *   无 per-test 收尾（不 closeApp——spec 级共享的本体）。
 */
export function createSharedLaunchFixture(config: SharedLaunchConfig) {
  let session: SharedLaunchSession | undefined
  const test = base.extend<SharedLaunchFixtures, SharedLaunchWorkerFixtures>({
    sharedSession: [
      // Playwright fixture 签名硬约束：首参必须解构形态（运行期源码校验，_name 形态被拒）
      // ——解构 worker 级 browser 占位（worker fixture 合法依赖，oxlint 无空解构两全）
      async ({ browser: _browser }, use) => {
        if (session === undefined) session = new SharedLaunchSession(config)
        await use(session)
        await session.dispose()
        session = undefined
      },
      { scope: 'worker', auto: true },
    ],
    sharedLaunch: async ({ sharedSession }, use) => {
      await sharedSession.beginTest()
      await use(sharedSession.handle())
    },
  })
  return { test }
}
