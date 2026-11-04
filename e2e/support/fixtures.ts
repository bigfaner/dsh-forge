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
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, type Dirent } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test as base, type ElectronApplication, type Page } from '@playwright/test'
import { bridgeDispatch, closeApp, launchHost, stablePhase, type LaunchHostOptions } from './launch.js'
import { forgeInvoke, registerProject } from './rpc.js'
import { COLLAPSE_RIGHTBAR_BUTTON, AP_ANY, HERO_WORKSPACE_CHIP_NAME, OV_PANEL, RIGHTBAR_COLLAPSED, ovSubtabOf } from './anchors.js'
import { openOverviewDock } from './navigation.js'
import { newBlankSession } from './m3.js'
import { ensureNoBlockingDialog } from './modals.js'
import { PROJECTS_CHANNELS } from '../../packages/contracts/src/channels.js'

/** 摘除 dir 子树内全部文件、保留全部目录（目录 inode 不变——watcher 句柄存续；dir
 *  缺席静默零操作）。夹具重播种专用：seedWorkspace recursive mkdir 容忍既有目录。 */
function removeFilesKeepDirs(dir: string): void {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) removeFilesKeepDirs(path)
    else rmSync(path, { recursive: true, force: true })
  }
}

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
  /** 共享 userData 根（本 worker 独立持有——盘面判读直接锚定自身根，tmp 魔法前缀扫描退役） */
  readonly udDir: string
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
   *  不动）；首调时建目录 + userData。
   *  watch 衰减修复（fix-1，共享 launch 耦合判例）：重播种不删目录——只摘 .dsh 子树内的
   *  文件、保留全部目录 inode。宿主侧 expert-squad watcher（chokidar 深度 1）锚定
   *  wsDir/.dsh/experts；rm -rf 整目录 → root 缺失触发重挂，重挂竞速窗口内锚爬升祖先时
   *  runaway guard 弃监听（watch.ts anchor runaway guard），此后直编不再失效索引——
   *  whitelist 等后置用例读旧快照即红。保目录 inode = watcher 句柄跨重播种持续有效。 */
  reseed(): void {
    if (this.wsDirValue === undefined) {
      this.wsDirValue = mkdtempSync(join(tmpdir(), 'dsh-forge-shared-launch-ws-'))
      this.userData = mkdtempSync(join(tmpdir(), 'dsh-forge-shared-launch-ud-'))
    } else {
      removeFilesKeepDirs(join(this.wsDirValue, '.dsh'))
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
    // app 在场：仅重播种（状态复位——无冷启）+ 用例间 renderer 视图态复位 + 概览锚定隔离
    await this.resetRendererView()
    await this.archiveLegacyProjects()
    this.reseed()
  }

  /**
   * 用例间 renderer 视图态复位（fix-2 共享 launch 序列态轮转红）：重播种只复位 tmp
   * 档案态，renderer 视图态在此复位到 fresh-launch 基准——三段：
   *   ①Escape 关断上用例遗留弹层/菜单（批次一既有兜底）；
   *   ②概览面板隔离（基准归一）：上用例遗留展开的右栏概览 dock 收起归基准（fresh-launch
   *     右栏恒收起）——每个用例经 openOverviewDock → revealRightbar 收敛门在自己窗口内
   *     全新开面板，不继承跨用例 dockkit 打开态（防御纵深；锚定主径见 archiveLegacyProjects）；
   *   ③桥导航回官方会话面板（批次一「bridgeDispatch 还原前置」同语义上提到 fixture 层）
   *     + 相位稳定门等待收敛——概览项目锚（anchoredOverviewContext 主视图会话锚）先于
   *     用例 setup 收敛。各步 fail-soft（页面瞬态不阻塞用例）。
   */
  private async resetRendererView(): Promise<void> {
    const page = this.launched?.page
    if (page === undefined) return
    await page.keyboard.press('Escape').catch(() => undefined)
    // ①′ 添加项目模态收口（重播种级复位扩展——批次四a mode T3 picker overlay 残留拦截）：
    // 上用例遗留的官方 Modal 壳（添加项目流，回退浏览器相位）其 picker 行（.dswf-fb-item）
    // 与遮罩恒拦截 hero chip 菜单点击——closeAddProjectModal 单轮收口（1.20 单轮化）。
    await this.closeAddProjectModal(page)
    // ② 概览面板隔离：继承的展开右栏 + 概览 dock → 收起基准（幂等：已收起零操作）
    if ((await page.locator(OV_PANEL).first().isVisible().catch(() => false)) === true) {
      const collapse = page.locator(COLLAPSE_RIGHTBAR_BUTTON).first()
      if ((await collapse.isVisible().catch(() => false)) === true) {
        await collapse.click().catch(() => undefined)
        await page
          .waitForSelector(RIGHTBAR_COLLAPSED, { state: 'attached', timeout: 15_000 })
          .catch(() => undefined)
      }
    }
    await bridgeDispatch(page, 'show-session').catch(() => undefined)
    // ③′ 会话态复位（bug 09f5b987 共享 launch 序态泄漏）：bridgeDispatch 只回官方会话
    // 面板、不换会话——上用例遗留的主视图会话锚（非 blank 会话面）使 hero 工作区 chip
    // 锚缺席（selectWorkspaceViaChip 30s 恒 miss，uf3 第二用例判例）。hero chip 在场 =
    // 已在 fresh-launch 基准面零操作；缺席时经官方「新会话」入口重开 blank 会话归基准。
    // settle 窗（1.8）：复位链后 UI 未渲染即判读 = 瞬态假阴性 → 多余 newBlankSession 开户
    // （blank 会话目录污染 fixtureSessionIds birthtime 枚举与两会话锚——overview T1）。
    // 有界等待 chip 挂载（retryTransientWindow 同语义的判读形态），窗内未现才走重开径。
    // fail-soft（入口缺席 = 无残留可复位，零操作）。
    const heroChip = page.getByRole('button', { name: HERO_WORKSPACE_CHIP_NAME }).first()
    const heroChipSettled = await heroChip
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
    if (!heroChipSettled) {
      // fail-soft 显式豁免注记（与 m3.ts newBlankSession「不吞失败、异常上抛」口径对齐）：
      // m3 侧本函数两径失败均上抛（spec 侧调用方如实判红）；此处复位链吞异常是唯一豁免点
      // ——复位链全步 fail-soft（页面瞬态不阻塞用例，见本函数头注），newBlankSession 失败
      // = 无残留可复位或入口瞬态缺席，上抛会把夹具复位瞬态误判为产品红，故显式豁免吞掉。
      await newBlankSession(page).catch(() => undefined)
      // 晚到模态收口（同一泄漏族的拦截面）：上用例零凭据模型失败面可晚数十秒挂载
      // API Key onboarding（mask 拦指针）——复位窗内点掉，防残入用例体拦截 chip 点击。
      await ensureNoBlockingDialog(page)
    }
    // ④ 侧栏视图态复位（序列态轮转红：视图态机 useState 挂 ForgeWorkspacePanel——共享
    //   launch 下面板跨用例存活，上用例遗留 archivedFilter=only / groupBy=flat 使下用例
    //   项目行锚失配（项目改名用例锚不外——D2 triage 判例）。经视图菜单点回缺省基准
    //   （SIDEBAR_VIEW_DEFAULT = 按项目树 + 不含归档）；测试侧序态泄漏，非产品红。
    await this.resetSidebarView(page)
    await stablePhase(page).catch(() => undefined)
  }

  /**
   * 侧栏视图态复位（④）：宽态侧栏段头视图菜单（[data-dswf-view-menu]）点回缺省两维
   * （按项目树 + 不含归档）。菜单 onSelect 即收，两维各开一轮；幂等（已选中项再点
   * zero-op）且全步 fail-soft（侧栏收起/菜单缺席 = 无遗留可复位，零操作）。
   * 步超时 3s 有界（bug 09f5b987 定谳探针：③′ 会话态复位把主视图归 hero 面后侧栏
   * 段头在场、菜单项失配——缺省 15s click 超时 ×2 轮烧满 30s 顶穿 beginTest 预算；
   * fail-soft 步不配长等，失配即让步）。
   */
  private async resetSidebarView(page: Page): Promise<void> {
    for (const label of ['按项目树', '不含归档']) {
      const trigger = page.locator('[data-dswf-view-menu]').first()
      if ((await trigger.isVisible().catch(() => false)) !== true) return
      await trigger.click({ timeout: 3_000 }).catch(() => undefined)
      const menu = page.locator('[role="menu"]').first()
      if ((await menu.isVisible().catch(() => false)) !== true) return
      const item = menu
        .locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')
        .filter({ hasText: label })
        .first()
      await item.click({ timeout: 3_000 }).catch(() => undefined)
      await menu.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined)
    }
  }

  /**
   * 添加项目模态收口（重播种级复位扩展——批次四a mode T3 picker overlay 拦截，1.18）：
   * 添加项目官方 Modal 壳（回退浏览器相位）其 picker 行（.dswf-fb-item）与遮罩恒拦截
   * hero chip 菜单点击（批内恒红形态；触发链定谳见 archiveLegacyProjects 保活例外注）。
   * 关断走官方 Modal 自身缝隙：Escape → requestClose（三分守卫取消点）；未兑现（弹层未消）
   * 补点模态关闭钮（closeLabel「关闭」）。单轮有界（1.20 复位链单轮化——防线性膨胀吃共享
   * 提速红利）；模态缺席零操作（幂等）。各步 fail-soft（页面瞬态不阻塞用例）。
   */
  private async closeAddProjectModal(page: Page): Promise<void> {
    const modal = page.locator(AP_ANY).first()
    if ((await modal.isVisible().catch(() => false)) !== true) return
    await page.keyboard.press('Escape').catch(() => undefined)
    const closed = await modal
      .waitFor({ state: 'hidden', timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
    if (closed) return
    await page.getByRole('button', { name: '关闭' }).first().click().catch(() => undefined)
    await modal.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined)
  }

  /**
   * 遗留项目归档（fix-2 概览锚定隔离——本修复主径）：重播种时把账本面遗留注册项目全量
   * 归档。语义依据：概览项目锚 = anchoredOverviewContext（主视图会话锚优先 / 唯一活跃
   * 项目兜底）——共享序列下芯片流新会话入口间歇不切换主视图（快照实证：主视图停留上
   * 用例会话，概览锚残留上用例项目 → tasks 行缺席轮转红）。归档遗留行后，锚定两路
   * 都收敛到当前用例唯一活跃项目（会话锚只在活跃行内解析 + 兜底计活跃行——bug 1e761ada
   * 机制面），不再依赖芯片流会话是否成功创建。各步 fail-soft（list 失败静默跳过——
   * 非概览用例零影响，用例自持 setupWorld 注册不受影响）。
   * 退场判据（F7）：概览项目锚（anchoredOverviewContext 主视图会话锚 / 唯一活跃项目
   * 兜底）不再跨用例残留（锚定机制收敛或共享 fixture 形态退役）时，本步可整体移除。
   * 夹具项目保活例外（1.18 mode T3 定谳）：workspaceName 同名行不归档。归档后 T3 芯片流
   * （registerProject 幂等返回已归档行）点击 chip 时 picker 行集为零活跃行 → HeroWorkspace
   * Picker 空集直达缝（addIsTheOnlyEntry——HeroWorkspacePicker.tsx addOnly 效应）径直
   * openAddProductFlow，添加项目模态（回退浏览器 picker 行）即起并恒拦截后续点击——
   * 「picker overlay 残留」实为此触发链（diag run2 点击探针定谳：chip click → +60ms 模态
   * 入树，非上用例遗留）。同名行 = 本 fixture 当前唯一活跃项目本体，保活恰使概览锚两路
   * （主视图会话锚 / 唯一活跃项目兜底）收敛于其上——与 fix-2 归档初衷同向。
   */
  private async archiveLegacyProjects(): Promise<void> {
    const page = this.launched?.page
    if (page === undefined) return
    try {
      const projects = await forgeInvoke<readonly { id: string; name: string; archived: boolean }[]>(
        page, PROJECTS_CHANNELS.list,
      )
      let archivedCount = 0
      for (const row of projects) {
        if (row.archived === true) continue
        if (row.name === this.config.workspaceName) continue
        await forgeInvoke(page, PROJECTS_CHANNELS.update, { id: row.id, patch: { archived: true } })
          .catch(() => undefined)
        archivedCount++
      }
      console.log(`[shared-launch] 遗留项目归档（${String(archivedCount)} 行归档 / ${String(projects.length)} 行对账）`)
    } catch {
      /* fail-soft：非概览用例/瞬态零影响 */
    }
  }

  handle(): SharedLaunchHandle {
    if (this.launched === undefined) throw new Error('shared-launch: 会话未启动（beginTest 未调用）')
    return {
      page: this.launched.page,
      app: this.launched.app,
      pageErrors: this.launched.pageErrors,
      wsDir: this.wsDirValue!,
      udDir: this.userData!,
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

/**
 * 活跃项目全量归档（e2e 支撑面——共享 launch 形态修复，e2e-upstream-drift-reds-triage 清账 B）：
 * 归档当前全部活跃项目行（含夹具 root 行；exceptProjectId 在场则豁免），使 projectAnchorOf
 * 唯一活跃项目兜底（apps/web/src/workbench/panel-model.ts:91）可收敛于用例注册的项目。
 * 归因：task-overview-review ×11 红原归因「概览头渲染链变更」不成立（head 渲染链自始未变）
 * ——真实红因 = 共享 launch 形态下夹具 root 项目保活（archiveLegacyProjects workspaceName
 * 例外）+ 用例项目注册后多项目在场、主视图会话锚解析回 root 项目 → 锚定漂移（ov-head 呈
 * root 项目名，任务行缺席）。产品源码零改动——纯 e2e 形态问题。
 * 时序纪律（run 实证）：必须在用例项目 registerProject **之前**调用——renderer 项目快照
 * 刷新锚 = 注册写推送（useAnchoredProjects workspace 归属身份变化），update 归档不触发
 * 刷新；注册后归档则快照残留 root 活跃行，锚定不迁移。注册随后的快照刷新里锚定收敛。
 */
export async function archiveActiveProjects(page: Page, exceptProjectId?: string): Promise<void> {
  const projects = await forgeInvoke<readonly { id: string; archived?: boolean }[]>(page, PROJECTS_CHANNELS.list)
  for (const row of projects) {
    if (row.id === exceptProjectId || row.archived === true) continue
    await forgeInvoke(page, PROJECTS_CHANNELS.update, { id: row.id, patch: { archived: true } })
  }
}

// ─── 共享 ud 根定位 / ws 段锚（1.17 支撑层收敛——spec 侧魔法前缀扫描退役） ───

/** wsDir 末段锚（mkdtemp 随机后缀跨 worker 唯一——调用用时点求值；大小写归一由消费侧裁定） */
export function wsSegment(wsDir: string): string {
  return wsDir.split(/[\\/]/).pop() ?? ''
}

/**
 * 共享 launch userData 根内定位（缺席即报错——断言式缺席消费面直用 udDir 求值）：probe
 * 对 ud 根求值，返回非 undefined 即命中。跨 worker 串扰面连根消除——判读恒锚本 worker
 * 独立持有的 ud 根（SharedLaunchHandle.udDir 透传），不再扫 tmp 下 dsh-forge-shared-launch-ud-*
 * 魔法前缀（段锚 mkdtemp 随机后缀本就只存在于自身根，语义等价且零串扰）。
 */
export function requireInSharedUdRoot<T>(udDir: string, probe: (udDir: string) => T | undefined, absentMessage: string): T {
  const hit = probe(udDir)
  if (hit === undefined) throw new Error(absentMessage)
  return hit
}

/** boot-overlay.yml 文本（boot-overlay 判读单源——spec 侧薄封装退役；缺席即报错） */
export function sharedOverlayText(udDir: string): string {
  return requireInSharedUdRoot(udDir, (ud) => {
    const file = join(ud, 'boot-overlay.yml')
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined
  }, 'shared-launch: boot-overlay.yml 未找到（共享 userData 根缺失）')
}

// ─── 瞬态重试 helper（共享 launch 序列态瞬态窗对策——同语义三处收编单源） ───

export type OverviewSubtab = 'proposals' | 'features' | 'tasks' | 'bugs'

export interface RetryTransientWindowOptions {
  /** 单轮尝试（轮内既有超时门原样保留——瞬态窗对策，非放宽断言） */
  readonly attempt: () => Promise<void>
  /** 每轮失败后的收口（缺省零操作） */
  readonly recover?: (page: Page) => Promise<void>
  /** 轮数（缺省 3） */
  readonly rounds?: number
  /** 轮间静置 ms（缺省 3000） */
  readonly backoffMs?: number
}

/**
 * 瞬态窗重试（共享 launch 序列态——上用例会话面沉降窗内中心列拦截 / 菜单重挂载行
 * detached 等；失败后 recover 收口再整段重试，keyed body 重挂载触发布局重解析）。
 * 末轮仍失败抛最后捕获的 cause——原 spec 内三处同语义实现（openOverviewSubtab /
 * selectWorkspaceWithRetry / openOverviewDockWithRetry）的收编单源。
 */
export async function retryTransientWindow(page: Page, opts: RetryTransientWindowOptions): Promise<void> {
  const rounds = opts.rounds ?? 3
  const backoffMs = opts.backoffMs ?? 3_000
  let lastCause: unknown
  for (let i = 0; i < rounds; i++) {
    try {
      await opts.attempt()
      return
    } catch (cause) {
      lastCause = cause
      if (opts.recover !== undefined) await opts.recover(page).catch(() => undefined)
      await new Promise((resolve) => setTimeout(resolve, backoffMs))
    }
  }
  throw lastCause
}

/** 概览 tab 关断收口（重开触发 keyed body 重挂载——openOverviewDockWithRetry 同径） */
async function closeOverviewTab(page: Page): Promise<void> {
  await page
    .getByRole('tab', { name: /项目概览/ })
    .getByRole('button', { name: '关闭' })
    .click()
    .catch(() => undefined)
}

/**
 * 概览 dock 打开 + 子 tab 激活收敛（挂载重试 ×3，轮内 30s 挂载门 / 15s 激活门原样保留
 * ——原批次四a 四份 spec 内同语义 helper 的收编单源）。
 */
export async function openOverviewSubtab(page: Page, subtab: OverviewSubtab): Promise<void> {
  await retryTransientWindow(page, {
    attempt: async () => {
      await openOverviewDock(page)
      const tab = page.locator(ovSubtabOf(subtab))
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    },
    recover: closeOverviewTab,
  })
}

/** 概览 dock 挂载重试（不带子 tab 激活——dogfood-sc-m3-replay 收编形态；rounds 轮 × 2s） */
export async function openOverviewDockWithRetry(page: Page, rounds: number): Promise<void> {
  await retryTransientWindow(page, { attempt: () => openOverviewDock(page), recover: closeOverviewTab, rounds, backoffMs: 2_000 })
}

// ─── tracked 文件写径复位（写前备份 + finally 逐字还原——panel-detail / ac4-routing-probe 收编单源） ───

/** 写前备份：tracked 文件文本（缺席返回 null——原始缺席态随备份携带） */
export function backupTrackedFile(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

/**
 * finally 逐字还原（零残留纪律）：原始缺席 → 清空文件内容（保文件在场——宿主对 tracked
 * 文件缺省空态语义）；在案 → 内容与备份一致时零写（mtime 不漂）、不一致时逐字还原。
 */
export function restoreTrackedFile(path: string, backup: string | null): void {
  if (backup === null) {
    if (existsSync(path)) writeFileSync(path, '', 'utf8')
  } else if (readFileSync(path, 'utf8') !== backup) {
    writeFileSync(path, backup, 'utf8')
  }
}
