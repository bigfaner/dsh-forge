/**
 * hero 新会话视图（mockup 屏⑤，路由 `#/hero`）——
 * 数据源 = `forge:worktree/list`（透传通道，项目根注入）+ `session.create`（官方面）+
 * `forge:worktree/session-create`（预铸采纳单门透传——host 建会话守卫）。
 *
 * 交互口径（US-6）：默认模式=突击、分支=当前所在（不强切）；乐观切换——点选即改
 * 选中态（零网络、零预检调用）；host 建会话守卫拒绝（session-create 错误回执）→
 * 确认框（选回/仍要切换，widgets/confirm 回执驱动，UI 无预检说明文本）。
 * 建会话双径：默认分支（=当前所在）走官方 `session.create`；非默认 worktree 走
 * `forge:worktree/session-create` 透传。`forge:remote/session-links` 预检不实现
 * （api-handbook 1.2 延后可选）。
 *
 * 结构：createHeroController 纯状态机（单测主战场——load() 为唯一显式 I/O 挂点）+
 * createHeroView 薄装配（仓内零 jsdom 惯例：DOM 胶水不进单测，对齐证据走 Playwright 走查）。
 */
import type { OfficialApi } from '../core/api.ts'
import type { RemoteRpc } from '../core/rpc.ts'
import type { PendingModelDefault } from './models.ts'
import { el, ensureIconSprite } from '../widgets/msg-cards.ts'
import { createComposer, type ComposerHandle } from '../widgets/composer.ts'
import { showConfirm } from '../widgets/confirm.ts'

// ---------------------------------------------------------------------------
// 常量（口径）
// ---------------------------------------------------------------------------

/** worktree 清单通道（contracts WORKTREE_CHANNELS.list 透传）。 */
export const HERO_WORKTREE_LIST_CHANNEL = 'forge:worktree/list'
/** 建会话守卫通道（contracts WORKTREE_CHANNELS.sessionCreate 透传——预铸采纳单门）。 */
export const HERO_SESSION_CREATE_CHANNEL = 'forge:worktree/session-create'
/** 默认模式（US-6：默认突击）。 */
export const HERO_DEFAULT_MODE = '突击'

/** forge 自有预设（突击 = steer 抢占 / 远征 = queue 排队）。 */
export const FORGE_MODES: readonly string[] = ['突击', '远征']

/** dsh 内置四预设（官方 dsh-client-ui-agent-preset roster——id 'standard'/'ptc'/'minimal'/'cordis'
 *  源码核销；显示名取官方 zh 词典「标准模式/PTC 模式/极简模式/创造模式」短形）。 */
export const BUILTIN_AGENT_PRESETS: Readonly<Record<string, string>> = {
  标准: 'standard',
  PTC: 'ptc',
  极简: 'minimal',
  创造: 'cordis',
}

/** hero 模式目录 = forge 双预设 + dsh 内置四模式（用户裁决 2026-10-22）。 */
export const HERO_MODES: readonly string[] = [...FORGE_MODES, ...Object.keys(BUILTIN_AGENT_PRESETS)]

// ---------------------------------------------------------------------------
// 纯函数：清单收敛 + 行派生
// ---------------------------------------------------------------------------

/** bw-pop 分支行模型（WorktreeEntryDto 窄化——缺字段 fail-soft 剔行）。 */
export interface HeroWorktreeRow {
  /** worktree 绝对路径（session-create worktreePath；主行 = 项目根） */
  readonly path: string
  /** 检出分支短名（detached/bare = null → 展示名退 worktreeName） */
  readonly branch: string | null
  readonly worktreeName: string
  readonly isMain: boolean
}

export interface HeroWorktreeListModel {
  readonly isGit: boolean
  readonly rows: readonly HeroWorktreeRow[]
}

function coerceRow(entry: unknown): HeroWorktreeRow | null {
  if (typeof entry !== 'object' || entry === null) return null
  const record = entry as { path?: unknown; branch?: unknown; worktreeName?: unknown; isMain?: unknown }
  const path = typeof record.path === 'string' && record.path !== '' ? record.path : ''
  if (path === '') return null
  return {
    path,
    branch: typeof record.branch === 'string' && record.branch !== '' ? record.branch : null,
    worktreeName:
      typeof record.worktreeName === 'string' && record.worktreeName !== ''
        ? record.worktreeName
        : path.replaceAll('\\', '/').split('/').pop() ?? path,
    isMain: record.isMain === true,
  }
}

/** forge:worktree/list 响应收敛（缺字段 fail-soft：isGit 缺席 = false，entries 非数组 = 空集）。
 *  bug 488e860d：detached/bare 行（branch=null）剔行——预铸挂靠契约 = 一 worktree 一分支，
 *  无分支行选中必被 session-create typed 拒绝（死路 UX）；发送面自动回退官方面。 */
export function coerceWorktreeList(raw: unknown): HeroWorktreeListModel {
  if (typeof raw !== 'object' || raw === null) return { isGit: false, rows: [] }
  const frame = raw as { isGit?: unknown; entries?: unknown }
  const entries = Array.isArray(frame.entries) ? frame.entries : []
  return {
    isGit: frame.isGit === true,
    rows: entries
      .map(coerceRow)
      .filter((row): row is HeroWorktreeRow => row !== null && row.branch !== null),
  }
}

/** 路径归一键（反斜杠→正斜杠 + 去尾斜杠 + 小写——跨源比对单源）。 */
function pathKey(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * 默认选中行（US-6：分支=当前所在，不强切）：当前分支命中行优先（大小写不敏感、
 * 斜杠归一）；未命中回退主行；再回退首行；空集 = null（composer 只显当前分支名）。
 */
export function pickDefaultRow(
  rows: readonly HeroWorktreeRow[],
  currentBranch: string | undefined,
): HeroWorktreeRow | null {
  if (currentBranch !== undefined && currentBranch !== '') {
    const needle = pathKey(currentBranch)
    const hit = rows.find((row) => row.branch !== null && row.branch.toLowerCase() === needle)
    if (hit !== undefined) return hit
  }
  return rows.find((row) => row.isMain) ?? rows[0] ?? null
}

/** 行展示名（branch 缺席退 worktreeName）。 */
export function rowDisplayName(row: HeroWorktreeRow): string {
  return row.branch ?? row.worktreeName
}

/** 行右缘说明文案（.k）：主行默认 = 「当前所在分支 · 主 worktree（默认）」；他行默认行 = 「当前所在分支」；复用行 = 「复用已有 worktree」。 */
export function rowHintText(row: HeroWorktreeRow, defaultRow: HeroWorktreeRow | null): string {
  if (defaultRow !== null && pathKey(row.path) === pathKey(defaultRow.path)) {
    return row.isMain ? '当前所在分支 · 主 worktree（默认）' : '当前所在分支'
  }
  return '复用已有 worktree'
}

/** composer worktree chip 文案（mockup：`main · 当前所在分支`；复用行 = 分支名）。 */
export function composerWorktreeLabel(row: HeroWorktreeRow | null, defaultRow: HeroWorktreeRow | null): string {
  if (row === null) return ''
  return defaultRow !== null && pathKey(row.path) === pathKey(defaultRow.path)
    ? `${rowDisplayName(row)} · 当前所在分支`
    : rowDisplayName(row)
}

/** 是否走预铸采纳径（非默认 worktree 才触达 host 建会话守卫）。 */
export function needsWorktreeBinding(row: HeroWorktreeRow | null, currentWorktreePath: string | undefined): boolean {
  if (row === null) return false
  if (row.isMain) return false
  if (currentWorktreePath === undefined || currentWorktreePath === '') return true
  return pathKey(row.path) !== pathKey(currentWorktreePath)
}

/** hero 模式 → session.prompt mode（突击 = steer 抢占、远征 = queue 排队）。 */
export function promptModeOf(mode: string): 'steer' | 'queue' {
  return mode === '远征' ? 'queue' : 'steer'
}

// ---------------------------------------------------------------------------
// 控制器（纯状态机——单测主战场，零 DOM；load() 为唯一显式 I/O 挂点）
// ---------------------------------------------------------------------------

export type HeroPop = 'branch' | 'mode' | null

/** hero 可渲染状态快照（视图按快照重绘弹层/chip + 守卫确认框挂点）。 */
export interface HeroState {
  readonly pop: HeroPop
  readonly rows: readonly HeroWorktreeRow[]
  readonly defaultRow: HeroWorktreeRow | null
  /** 乐观选中行路径（null = 无清单/composer 只显当前分支名）。 */
  readonly selectedPath: string | null
  readonly mode: string
  readonly modes: readonly string[]
  /** 守卫拒绝回执（非 null = 视图须弹确认框——选回/仍要切换）。 */
  readonly pendingGuard: { readonly reason: string } | null
  readonly busy: boolean
  /** worktree 选择可用位（bug 488e860d：isGit × 可挂靠行在场——false = chip 隐藏、发送恒官方面）。 */
  readonly gitReady: boolean
}

export interface HeroDeps {
  readonly rpc: RemoteRpc
  readonly api: Pick<OfficialApi, 'createSession' | 'prompt' | 'selectAgentPreset' | 'listAgentPresets' | 'selectModel'>
  /** 项目根（forge:worktree/list payload；缺席 = 不拉清单，composer 只显当前分支）。 */
  readonly projectRoot?: string
  /** 当前所在分支/工作树路径（默认选中与双径判定的锚；缺席 = 无在留会话语义）。 */
  readonly currentBranch?: string
  readonly currentWorktreePath?: string
  readonly workspaceId?: string
  /**
   * 新会话默认档（bug 38ab5a8d 用户裁决 2026-10-22）：hero 模型视图暂存的默认档——
   * 建会话成功即 select-model 下发（含推理等级）并清除；read 缺席 = 行为不变。
   */
  readonly modelDefault?: { read(): PendingModelDefault | undefined; clear(): void }
  readonly onOpenSession: (sessionId: string) => void
  readonly modes?: readonly string[]
  /** 状态变更通知（视图重绘挂点；缺席 = 纯控制器单测）。 */
  readonly onChange?: () => void
}

export interface HeroController {
  state(): HeroState
  /** 清单装载（forge:worktree/list → 默认行 = 当前所在）。 */
  load(): Promise<void>
  /** 乐观切换：点选即改选中态（零网络、零预检）。 */
  pickBranch(path: string): void
  pickMode(mode: string): void
  openPop(kind: Exclude<HeroPop, null>): void
  closePop(): void
  /** 顶栏新会话钮：回默认模式/默认分支。 */
  reset(): void
  /** composer 发送：建会话双径 + 首条消息透传。 */
  send(text: string): Promise<void>
  /** 守卫回执确认框点按（选回 = cancel / 仍要切换 = confirm）。 */
  resolveGuard(choice: 'confirm' | 'cancel'): void
}

export function createHeroController(deps: HeroDeps): HeroController {
  // 模式清单 = forge 双预设（恒前）+ 官方 roster 动态追加（增减随 host——不可达回退内置四）
  let modes: readonly string[] = deps.modes ?? [...FORGE_MODES, ...Object.keys(BUILTIN_AGENT_PRESETS)]
  /** 模式名 → agentPreset id（roster/内置映射——forge 双预设无 id = prompt mode 语义）。 */
  let presetIdOf: Readonly<Record<string, string>> = BUILTIN_AGENT_PRESETS
  let rows: readonly HeroWorktreeRow[] = []
  let defaultRow: HeroWorktreeRow | null = null
  let selectedPath: string | null = null
  let mode = HERO_DEFAULT_MODE
  let pop: HeroPop = null
  let pendingGuard: { readonly reason: string } | null = null
  let busy = false
  let gitReady = false

  const emit = (): void => deps.onChange?.()
  const selectedRow = (): HeroWorktreeRow | null => rows.find((row) => row.path === selectedPath) ?? null

  function createPlainSession(): Promise<string> {
    // bug 16ac5bc2（Root cause: 隧道域 workspaceId 恒缺席——官方 workspace.list 已弃用不
    // 供给，空串直达官方 controller 被 workspace 解析拒绝「workspace "" not found」）：
    // workspaceId 在场才走官方面；缺席回退 forge:worktree/session-create 单门（预铸采纳，
    // 主树锚 = 当前所在 worktree ?? 项目根）——与桌面 create-wrap 同一建会话正门。
    if (deps.workspaceId !== undefined && deps.workspaceId !== '') {
      return deps.api.createSession(deps.workspaceId).then((created) => created.sessionId)
    }
    const anchor = deps.currentWorktreePath ?? deps.projectRoot
    if (anchor === undefined || anchor === '') {
      return Promise.reject(new Error('无 workspaceId 且无主树锚——无法建会话（workspaceId/projectRoot 均缺席）'))
    }
    return deps.rpc
      .call<{ sessionId: string; branch: string }>(HERO_SESSION_CREATE_CHANNEL, { worktreePath: anchor })
      .then((result) => {
        if (result.ok) return result.data.sessionId
        throw new Error(`forge 建会话拒绝：${result.error.reason}`)
      })
  }

  /** 新会话默认档下发（bug 38ab5a8d）：select-model（含推理等级）→ 无论成败清暂存（会话
   *  已定向，滞留暂存会错发到下一个新会话）；失败 = 默认档不生效（诚实降级，不阻断进入）。 */
  async function applyPendingDefault(sessionId: string): Promise<void> {
    const pendingDefault = deps.modelDefault?.read()
    if (pendingDefault === undefined) return
    deps.modelDefault?.clear()
    try {
      await deps.api.selectModel(sessionId, pendingDefault.provider, pendingDefault.id, pendingDefault.reasoningEffort)
    } catch {
      /* 下发失败不阻断进入会话 */
    }
  }

  async function enter(sessionId: string, text: string): Promise<void> {
    // agentPreset 模式 = select 下发（roster id 单源）；forge 双预设走 prompt mode。
    // 官方面缺席（隧道域 /api 403 族）不阻断进入会话——预设保持部署默认（诚实降级）。
    const presetId = presetIdOf[mode]
    if (presetId !== undefined) {
      try {
        await deps.api.selectAgentPreset(sessionId, presetId)
      } catch {
        /* 预设下发失败不阻断——会话已建 */
      }
    }
    await applyPendingDefault(sessionId)
    if (text.trim() !== '') {
      try {
        // bug 1eb525b7 后继：首条消息恒 queue（followup）——新会话 agent 必空闲，官方 steer
        // 对空闲 agent 恒拒绝（session/agent-busy「prompt rejected」）；followup 即启等价达成
        await deps.api.prompt(sessionId, text, 'queue')
      } catch {
        /* 首条消息投递失败不阻断进入会话（会话已建） */
      }
    }
    busy = false
    deps.onOpenSession(sessionId)
    emit()
  }

  return {
    state: () => ({ pop, rows, defaultRow, selectedPath, mode, modes, pendingGuard, busy, gitReady }),

    async load() {
      // 预设 roster 装载（用户裁决 2026-10-22：模式清单非固定——增减随 host。
      // forge 双预设恒前；roster 行 name 缺席回退 id；broken 预设剔行；不可达 = 回退内置四）
      try {
        const { presets } = await deps.api.listAgentPresets()
        const roster = presets
          .filter((row): row is { id: string; name?: string; broken?: string } => typeof row === 'object' && row !== null && typeof (row as { id?: unknown }).id === 'string')
          .filter((row) => typeof row.broken !== 'string' || row.broken === '')
        if (roster.length > 0) {
          const idOf: Record<string, string> = {}
          const names = roster.map((row) => {
            const name = typeof row.name === 'string' && row.name !== '' ? row.name : row.id
            idOf[name] = row.id
            return name
          })
          presetIdOf = idOf
          modes = [...FORGE_MODES, ...names.filter((name) => !FORGE_MODES.includes(name))]
          if (!modes.includes(mode)) mode = HERO_DEFAULT_MODE
          emit()
        }
      } catch {
        /* roster 不可达——回退内置四静态清单 */
      }
      if (deps.projectRoot === undefined || deps.projectRoot === '') return
      const result = await deps.rpc.call<unknown>(HERO_WORKTREE_LIST_CHANNEL, { projectRoot: deps.projectRoot })
      if (!result.ok) return
      const list = coerceWorktreeList(result.data)
      rows = list.rows
      gitReady = list.isGit && rows.length > 0
      if (!gitReady) selectedPath = null
      defaultRow = pickDefaultRow(rows, deps.currentBranch)
      selectedPath = defaultRow?.path ?? null
      emit()
    },

    pickBranch(path) {
      if (!rows.some((row) => row.path === path)) return
      selectedPath = path
      pop = null
      emit()
    },

    pickMode(next) {
      if (!modes.includes(next)) return
      mode = next
      pop = null
      emit()
    },

    openPop(kind) {
      pop = kind
      emit()
    },

    closePop() {
      pop = null
      emit()
    },

    reset() {
      mode = HERO_DEFAULT_MODE
      selectedPath = defaultRow?.path ?? null
      pop = null
      emit()
    },

    async send(text) {
      if (busy || pendingGuard !== null) return
      busy = true
      emit()
      try {
        const selected = selectedRow()
        if (needsWorktreeBinding(selected, deps.currentWorktreePath)) {
          // 透传径：预铸采纳单门 = host 建会话守卫（回执驱动，无预检调用）
          const result = await deps.rpc.call<{ sessionId: string; branch: string }>(HERO_SESSION_CREATE_CHANNEL, {
            worktreePath: selected?.path,
          })
          if (result.ok) {
            await enter(result.data.sessionId, text)
            return
          }
          // 守卫拒绝回执 → 确认框待决（busy 保持——确认期间发送面冻结）
          pendingGuard = { reason: result.error.reason }
          emit()
          return
        }
        // 官方面径：默认分支/当前所在（不触守卫）
        await enter(await createPlainSession(), text)
      } catch {
        busy = false
        emit()
      }
    },

    resolveGuard(choice) {
      if (pendingGuard === null || !busy) return
      pendingGuard = null
      if (choice === 'cancel') {
        // 选回：乐观选中态回退当前所在（默认行）
        selectedPath = defaultRow?.path ?? null
        busy = false
        emit()
        return
      }
      // 仍要切换：保留选中态，会话经官方面落主树（首条消息落主树语义）
      void createPlainSession()
        .then(async (sessionId) => {
          await applyPendingDefault(sessionId)
          busy = false
          deps.onOpenSession(sessionId)
          emit()
        })
        .catch(() => {
          busy = false
          emit()
        })
    },
  }
}

// ---------------------------------------------------------------------------
// 视图装配（薄胶水——DOM 不进单测，对齐证据走 Playwright 走查）
// ---------------------------------------------------------------------------

export interface HeroViewDeps extends HeroDeps {
  readonly projectName?: string
  readonly onOpenDrawer?: () => void
  readonly onOpenSettings?: () => void
}

export function createHeroView(deps: HeroViewDeps): HTMLElement {
  // 渲染函数声明提升——控制器装配即携带重绘挂点（单控制器，无双实例）
  const controller = createHeroController({
    ...deps,
    onChange: () => {
      renderPop()
      renderChips()
      renderGuard()
    },
  })
  const root = el('div', 'phone-root')
  ensureIconSprite(root)

  // ---- 顶栏（屏⑤：☰ / 新会话 / 新会话重置）----
  const topbar = el('div', 'topbar')
  const menuButton = el('button', 'iconbtn')
  menuButton.innerHTML = '<svg class="ic"><use href="#i-menu"/></svg>'
  menuButton.addEventListener('click', () => deps.onOpenDrawer?.())
  const resetButton = el('button', 'iconbtn')
  resetButton.title = '新会话'
  resetButton.innerHTML = '<svg class="ic"><use href="#i-new"/></svg>'
  resetButton.addEventListener('click', () => controller.reset())
  topbar.append(menuButton, el('div', 'title', '新会话'), resetButton)

  // ---- hero 主区（proj 徽标 / logo / slogan / 问候）----
  const hero = el('div', 'hero')
  if (deps.projectName !== undefined && deps.projectName !== '') {
    const proj = el('div', 'proj')
    proj.innerHTML = '<svg class="ic" style="width:13px;height:13px"><use href="#i-folder"/></svg>'
    proj.appendChild(document.createTextNode(deps.projectName))
    hero.appendChild(proj)
  }
  hero.insertAdjacentHTML(
    'beforeend',
    '<svg class="logo" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#4176e6"/><path d="M18 38c6 4 14 5 22 2 6-2 9-6 8-10-1-3-5-5-9-4-5 1-7 5-5 8-4-1-9-3-13-7-2 4-3 8-3 11z" fill="#fff"/></svg>',
  )
  hero.appendChild(el('div', 'slogan', '知识就是力量'))
  hero.appendChild(el('div', 'hi', '你好，有什么我能帮你的吗？'))

  // ---- 输入区：bw-pop（分支/模式弹层）挂 composer.inputbar 头部 + composer ----
  const bwPop = el('div', 'bw-pop')
  bwPop.hidden = true

  const composer: ComposerHandle = createComposer({
    mode: HERO_DEFAULT_MODE,
    worktree: '',
    onSend: (text) => void controller.send(text),
    onSettings: () => deps.onOpenSettings?.(),
    onWorktreeTap: () => {
      // bug 488e860d：非 git / 无可挂靠行不开分支弹层（选择面不呈现死路）
      const state = controller.state()
      if (state.gitReady && state.rows.length > 0) controller.openPop('branch')
    },
    onModeTap: () => controller.openPop('mode'),
  })
  composer.root.prepend(bwPop)

  root.append(topbar, hero, composer.root)

  // bug 45e635af：chip 初始可见 + load() 早退路径（projectRoot 缺席 / 清单调用失败）不 emit
  // ——非 git 项目呈现「无选项的分支控件」。挂载即按初始态渲染一次（gitReady=false = 隐藏），
  // 之后仅由清单收敛的 emit 翻可见位。
  renderChips()

  // ---- 渲染（按状态快照重绘弹层/chip + 守卫确认框挂点）----
  function renderPop(): void {
    const state = controller.state()
    bwPop.hidden = state.pop === null
    bwPop.textContent = ''
    if (state.pop === 'branch') {
      for (const row of state.rows) {
        const item = el('div', `mi${row.path === state.selectedPath ? ' picked' : ''}`)
        item.innerHTML = '<svg class="ic" style="width:14px;height:14px"><use href="#i-branch"/></svg>'
        item.appendChild(document.createTextNode(rowDisplayName(row)))
        item.appendChild(el('span', 'k', rowHintText(row, state.defaultRow)))
        item.addEventListener('click', () => controller.pickBranch(row.path))
        bwPop.appendChild(item)
      }
      const addRow = el('div', 'mi add')
      addRow.appendChild(document.createTextNode('＋ 新建分支 / worktree…'))
      bwPop.appendChild(addRow)
    } else if (state.pop === 'mode') {
      for (const item of state.modes) {
        const row = el('div', `mi${item === state.mode ? ' picked' : ''}`)
        row.innerHTML = '<svg class="ic" style="width:14px;height:14px"><use href="#i-mode"/></svg>'
        row.appendChild(document.createTextNode(item))
        row.addEventListener('click', () => controller.pickMode(item))
        bwPop.appendChild(row)
      }
    }
  }

  function renderChips(): void {
    const state = controller.state()
    const selected = state.rows.find((row) => row.path === state.selectedPath) ?? null
    composer.setWorktreeVisible(state.gitReady && state.rows.length > 0)
    composer.setWorktree(composerWorktreeLabel(selected, state.defaultRow))
    composer.setMode(state.mode)
    composer.setSending(state.busy)
  }

  // ---- 守卫回执确认框（选回/仍要切换；回执驱动，UI 无预检说明文本）----
  let guardShown = false
  function renderGuard(): void {
    const state = controller.state()
    if (state.pendingGuard !== null && !guardShown) {
      guardShown = true
      void showConfirm(root, {
        title: '无法切换到所选分支',
        body: `host 建会话守卫拒绝：${state.pendingGuard.reason}。选回则留在当前分支，仍要切换则会话落主树。`,
        cancelLabel: '选回',
        confirmLabel: '仍要切换',
      }).then((choice) => {
        guardShown = false
        controller.resolveGuard(choice)
      })
    }
  }

  // ---- 数据：worktree 清单装载（默认分支 = 当前所在，不强切）----
  void controller.load()

  return root
}
