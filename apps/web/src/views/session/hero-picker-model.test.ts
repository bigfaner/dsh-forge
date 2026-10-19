// hero-picker-model 单测（fix-24 ① AC5）——项目映射纯函数三口径：
// workspaceId↔project 映射 / archived 排除 / 空集（添加唯一入口 + 直达判据）。
import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@dsh-forge/contracts'
import {
  activeSessionIdOf,
  activeSessionRowOf,
  blankSessionIdByCwdOf,
  heroPickerPlan,
  selectedProjectOf,
  selectedProjectRootOf,
  selectedProjectRootStrictOf,
  unambiguousOrchestrationRootOf,
  riskDialogNeeded,
  riskLatchConfirm,
  riskLatchFailureClear,
  riskLatchReselect,
  shouldArmSelectedRow,
  worktreeCwdKey,
  worktreeFaceUnavailableNotice,
  worktreeOrchestrationNotice,
  worktreeReuseBindDegradedNotice,
} from './hero-picker-model.js'

const project = (o: { id: string; workspaceId: string; name: string; archived?: boolean }): ProjectSummary => ({
  id: o.id,
  workspaceId: o.workspaceId,
  name: o.name,
  wsPath: `C:\\ws\\${o.id}`,
  archived: o.archived ?? false,
})

const PROJECTS = [
  project({ id: 'p1', workspaceId: 'w-1', name: 'alpha' }),
  project({ id: 'p2', workspaceId: 'w-2', name: 'beta' }),
  project({ id: 'p3', workspaceId: 'w-3', name: 'gamma', archived: true }),
]

describe('heroPickerPlan（行集 + 入口形态）', () => {
  it('行集 = 项目（id=workspaceId、name=label）；archived 排除（过滤口径与左栏一致）', () => {
    const plan = heroPickerPlan(PROJECTS, true)
    expect(plan.rows).toEqual([
      { id: 'w-1', name: 'alpha' },
      { id: 'w-2', name: 'beta' },
    ])
  })

  it('行集非空 → pinAdd=true、addIsTheOnlyEntry=false（添加项入 footer——官方 pinAdd 形态）', () => {
    const plan = heroPickerPlan(PROJECTS, true)
    expect(plan.pinAdd).toBe(true)
    expect(plan.addIsTheOnlyEntry).toBe(false)
  })

  it('空项目集 + 账面已定 → addIsTheOnlyEntry=true（弹层直达产品注册流——官方 :1935-1943 语义对齐）', () => {
    const plan = heroPickerPlan([], true)
    expect(plan.rows).toEqual([])
    expect(plan.pinAdd).toBe(false)
    expect(plan.addIsTheOnlyEntry).toBe(true)
  })

  it('账面未定（loading/error）且行集空 → 直达判据关（弹层仍呈现添加单项——不闪直达）', () => {
    const plan = heroPickerPlan([], false)
    expect(plan.addIsTheOnlyEntry).toBe(false)
    expect(plan.pinAdd).toBe(false)
  })

  it('全归档项目集 = 空行集同口径（archived 排除后直达判据生效）', () => {
    const plan = heroPickerPlan([project({ id: 'px', workspaceId: 'w-x', name: 'x', archived: true })], true)
    expect(plan.rows).toEqual([])
    expect(plan.addIsTheOnlyEntry).toBe(true)
  })
})

describe('selectedProjectOf（workspaceId ↔ 项目映射——owner selectedId 契约）', () => {
  it('selectedId 命中项目行 → 返回该行（onPick/selectedId 以 workspaceId 为键零翻译）', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows
    expect(selectedProjectOf(rows, 'w-2')).toEqual({ id: 'w-2', name: 'beta' })
  })

  it('selectedId 指向未绑定工作区（账本原生行）→ 无命中（零高亮——未绑定工作区不在弹层）', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows
    expect(selectedProjectOf(rows, 'w-native-unbound')).toBeUndefined()
  })

  it('selectedId 指向已归档项目 → 无命中（archived 排除口径的一致面）', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows
    expect(selectedProjectOf(rows, 'w-3')).toBeUndefined()
  })

  it('selectedId 缺席（无 pending 无会话归属）→ undefined', () => {
    expect(selectedProjectOf(heroPickerPlan(PROJECTS, true).rows, undefined)).toBeUndefined()
  })
})

describe('selectedProjectRootStrictOf（A7——编排源与渲染兜底分离）', () => {
  it('selectedId 命中项目 → ws_path（与 selectedProjectRootOf 首段一致）', () => {
    expect(selectedProjectRootStrictOf(PROJECTS, 'w-2')).toBe('C:\\ws\\p2')
  })

  it('selectedId 未命中/缺席 → null（即便存在其他活跃项目——渲染兜底禁止泄漏为编排源）', () => {
    expect(selectedProjectRootStrictOf(PROJECTS, 'w-native-unbound')).toBeNull()
    expect(selectedProjectRootStrictOf(PROJECTS, undefined)).toBeNull()
    expect(selectedProjectRootStrictOf(PROJECTS, 'w-3')).toBeNull() // archived 亦不充当编排源
  })
})

describe('unambiguousOrchestrationRootOf（A7 细化——selectedId 未命中时的唯一活跃项目兜底）', () => {
  it('活跃项目恰一个 → 该项目 ws_path（单项目零歧义——chip 渲染根即唯一绑定候选，bug 84edc6ff）', () => {
    expect(unambiguousOrchestrationRootOf([project({ id: 'p9', workspaceId: 'w-9', name: 'solo' })])).toBe('C:\\ws\\p9')
  })

  it('多个活跃项目 → null（歧义兜底禁止泄漏为编排源——A7 跨项目错绑防线保留）', () => {
    expect(unambiguousOrchestrationRootOf(PROJECTS)).toBeNull()
  })

  it('零活跃项目 / 唯一活跃项无 ws_path → null', () => {
    expect(unambiguousOrchestrationRootOf([])).toBeNull()
    expect(unambiguousOrchestrationRootOf([project({ id: 'p3', workspaceId: 'w-3', name: 'gamma', archived: true })])).toBeNull()
    const noPath = { ...project({ id: 'p8', workspaceId: 'w-8', name: 'nop' }), wsPath: '' }
    expect(unambiguousOrchestrationRootOf([noPath])).toBeNull()
  })
})

describe('selectedProjectRootOf（worktree 第二 chip 数据根——bug 10833861）', () => {
  it('selectedId（workspaceId 官方语义）经 workspaceId 回查命中 → 该项目 ws_path（直接比对 project.id 的类型错配不复存在）', () => {
    expect(selectedProjectRootOf(PROJECTS, 'w-2')).toBe('C:\\ws\\p2')
  })

  it('未选中/未命中 → 活跃首个有 ws_path 行兜底；归档行不参与（created_at 最早的归档项目不得成为数据根）', () => {
    const archivedFirst = [
      project({ id: 'p-learn', workspaceId: 'w-learn', name: 'learn', archived: true }),
      project({ id: 'p-main', workspaceId: 'w-main', name: 'main' }),
    ]
    expect(selectedProjectRootOf(archivedFirst, undefined)).toBe('C:\\ws\\p-main')
    expect(selectedProjectRootOf(archivedFirst, 'w-unknown')).toBe('C:\\ws\\p-main')
  })

  it('全归档/空集 → null（chip 零注入退回现状）', () => {
    expect(selectedProjectRootOf([project({ id: 'p3', workspaceId: 'w-3', name: 'gamma', archived: true })], undefined)).toBeNull()
    expect(selectedProjectRootOf([], 'w-1')).toBeNull()
  })
})

// 1.29——主视图在留会话行解析（id + cwd 双字段：草稿源寻址 + arm 去重判读）。
describe('activeSessionRowOf / activeSessionIdOf（账本活源读面）', () => {
  const ledger = (rows: Record<string, unknown>): { getSnapshot: () => { byId: Record<string, unknown> } } => ({
    getSnapshot: () => ({ byId: rows }),
  })

  it('mainView > 0 的行 → id + cwd 双读（首行命中即返回）', () => {
    const list = ledger({
      's-a': { retainedBy: { mainView: 0 } },
      's-b': { retainedBy: { mainView: 1 }, cwd: 'C:\\repo\\wt-a' },
    })
    expect(activeSessionRowOf(list)).toEqual({ id: 's-b', cwd: 'C:\\repo\\wt-a' })
    expect(activeSessionIdOf(list)).toBe('s-b')
  })

  it('无在留行 / cwd 空 → cwd undefined、id 照读；空账本 = undefined', () => {
    const noCwd = ledger({ 's-a': { retainedBy: { mainView: 2 } } })
    expect(activeSessionRowOf(noCwd)).toEqual({ id: 's-a', cwd: undefined })
    expect(activeSessionRowOf(ledger({}))).toBeUndefined()
    expect(activeSessionIdOf(undefined)).toBeUndefined()
  })
})

// 1.25（bug af65c0a9）双静默路显式化——文案纯函数单源。
describe('worktree 编排失败/缺席提示文案（1.25 不静默）', () => {
  it('注入面缺席 → 明示「编排面不可用」（旧插件面/装配降级，不静默 no-op）', () => {
    const text = worktreeFaceUnavailableNotice()
    expect(text).toContain('编排面不可用')
    expect(text).toContain('插件版本陈旧')
  })

  it('编排失败文案带环节语义：sessionCreate 失败 → 「创建挂靠会话」+ 原因', () => {
    const text = worktreeOrchestrationNotice('create', 'repo not found')
    expect(text).toContain('创建挂靠会话')
    expect(text).toContain('repo not found')
  })

  it('编排失败文案带环节语义：openSession 失败 → 「打开会话」+ 原因', () => {
    const text = worktreeOrchestrationNotice('open', 'session unloaded')
    expect(text).toContain('打开会话')
    expect(text).toContain('session unloaded')
  })
})

// 1.29——arm 闸纯函数（会话创建唯一时机 = 首条消息；主行 1.27 必绑同在该时点）。
describe('shouldArmSelectedRow（1.29 首条消息时点 arm 闸）', () => {
  const input = (over: Partial<Parameters<typeof shouldArmSelectedRow>[0]> = {}) => ({
    phaseReadyGit: true,
    path: 'C:/repo/.forge/worktrees/wt-a',
    suppressed: [],
    rowPresent: true,
    isMain: false,
    currentCwd: 'C:/repo/.forge/worktrees/wt-a',
    draftIntent: true,
    currentSessionId: 's-cur',
    armedSessionId: undefined,
    armedPath: undefined,
    riskConfirmationOpen: false,
    ...over,
  })

  // A4——确认框待决 × 编排在途/完成是未定义态：框开着期间效应守卫零重入
  it('确认框打开（riskConfirmationOpen）→ 不 arm（守卫链补 defaultRiskPath 闸——防双编排竞态）', () => {
    expect(shouldArmSelectedRow(input({ riskConfirmationOpen: true, currentCwd: 'C:/elsewhere' }))).toBe(false)
  })

  // A3——取消抑制与失败抑制拆分：取消写入的抑制集独立判读（显式重选清除后即可重走）
  it('取消抑制（cancelSuppressed 含 path）→ 不 arm；不在其中 → 照常 arm', () => {
    expect(shouldArmSelectedRow(input({ currentCwd: 'C:/elsewhere', cancelSuppressed: ['C:/repo/.forge/worktrees/wt-a'] }))).toBe(false)
    expect(shouldArmSelectedRow(input({ currentCwd: 'C:/elsewhere', cancelSuppressed: ['C:/other'] }))).toBe(true)
  })

  it('草稿空（无首条消息意图）→ 不 arm——点选/回填零会话副作用（1.29 唯一时机闸门）', () => {
    expect(shouldArmSelectedRow(input({ draftIntent: false }))).toBe(false)
  })

  it('树内行当前 cwd 已在选中树 → 不 arm（已在该会话，零重复建）', () => {
    expect(shouldArmSelectedRow(input())).toBe(false)
  })

  it('树内行 cwd 在别处 → arm（官方新会话流落回主树后重消费）', () => {
    expect(shouldArmSelectedRow(input({ currentCwd: 'C:/elsewhere' }))).toBe(true)
  })

  it('armed 去重：arm 产物即当前会话且选中路径未变 → 不 arm（键入续字零重入）', () => {
    expect(shouldArmSelectedRow(input({ currentCwd: 'C:/elsewhere', armedSessionId: 's-cur', armedPath: 'C:/repo/.forge/worktrees/wt-a' }))).toBe(false)
  })

  it('armed 去重失效：改选他行（armedPath ≠ path）→ 重新 arm', () => {
    expect(shouldArmSelectedRow(input({ currentCwd: 'C:/elsewhere', armedSessionId: 's-cur', armedPath: 'C:/repo' }))).toBe(true)
  })

  it('armed 去重失效：官方新会话流另起新 id → 重新 arm', () => {
    expect(shouldArmSelectedRow(input({ currentCwd: 'C:/elsewhere', armedSessionId: 's-old', armedPath: 'C:/repo/.forge/worktrees/wt-a', currentSessionId: 's-new' }))).toBe(true)
  })

  it('主行 cwd 恒等于项目根（官方 blank 落根、无绑定）→ 仍 arm（1.27：cwd 去重对主行不适用）', () => {
    expect(
      shouldArmSelectedRow(input({ path: 'C:/repo', isMain: true, currentCwd: 'C:\\repo\\' })),
    ).toBe(true)
  })

  it('主行 cwd 在别处（当前会话在别树）→ arm（预铸 sessionCreate 绑定项目根）', () => {
    expect(shouldArmSelectedRow(input({ path: 'C:/repo', isMain: true, currentCwd: 'C:/repo/.forge/worktrees/wt-a' }))).toBe(true)
  })

  it('失败抑制 / 行缺席 / 相位未就绪 / 无选中 → 一律不 arm', () => {
    expect(shouldArmSelectedRow(input({ suppressed: ['C:/repo/.forge/worktrees/wt-a'] }))).toBe(false)
    expect(shouldArmSelectedRow(input({ rowPresent: false }))).toBe(false)
    expect(shouldArmSelectedRow(input({ phaseReadyGit: false }))).toBe(false)
    expect(shouldArmSelectedRow(input({ path: undefined }))).toBe(false)
  })

  it('cwd 归一经 worktreeCwdKey 单源（分隔符/大小写/尾斜杠）', () => {
    expect(worktreeCwdKey('C:\\Repo\\')).toBe(worktreeCwdKey('c:/repo'))
  })
})

// A8——reuse 补绑定失败降级提示文案（不落「将落主树」假象——降级产物自带绑定）。
describe('worktreeReuseBindDegradedNotice（A8 降级语义）', () => {
  it('文案含降级语义与原因（补绑定失败 → 降级新建挂靠会话，非放弃编排）', () => {
    const text = worktreeReuseBindDegradedNotice('seal rpc timeout')
    expect(text).toContain('补绑定失败')
    expect(text).toContain('seal rpc timeout')
    expect(text).toContain('降级')
  })
})

// ───────────── 1.34 跨分支确认闩锁（bug ccfcc103——每键重弹修复）三组：
// ① 置位 ② 清退 ③ 确认续跑（含 armed 去重协同口径 pin） ─────────────
describe('riskLatch（bug ccfcc103 确认闩锁——置位/清退/确认续跑）', () => {
  const WT_A = 'C:/repo/.forge/worktrees/wt-a'

  it('置位：确认即置位（null→path），重复确认幂等（零重弹锚点）', () => {
    expect(riskLatchConfirm(null, WT_A)).toBe(WT_A)
    expect(riskLatchConfirm(WT_A, WT_A)).toBe(WT_A)
    expect(riskLatchConfirm('C:/other', WT_A)).toBe(WT_A) // 换确认目标覆盖
  })

  it('清退：换目标重选即清（重新判定）；同行重选保留（续字零重弹）；编排失败清退允许重试', () => {
    expect(riskLatchReselect(WT_A, WT_A)).toBe(WT_A) // 同行重选不清——确认后点 chip 不重弹
    expect(riskLatchReselect(WT_A, 'C:/other')).toBeNull() // 换目标 → 清，重新判定
    expect(riskLatchReselect(null, WT_A)).toBeNull()
    expect(riskLatchFailureClear(WT_A, WT_A)).toBeNull() // 编排失败 → 闩锁清退（Toast 后可重试重问）
    expect(riskLatchFailureClear(WT_A, 'C:/other')).toBe(WT_A) // 他行失败不误清
  })

  it('确认续跑：闩锁在位 → 弹框判定为不需要（续字/再发零重弹）；未闩 → 需弹框；闩锁只旁路弹框分支，armed 去重照常生效（协同 pin）', () => {
    expect(riskDialogNeeded(WT_A, null)).toBe(true) // 未确认 → 弹框
    expect(riskDialogNeeded(WT_A, WT_A)).toBe(false) // 已确认闩锁 → 零重弹
    expect(riskDialogNeeded(WT_A, 'C:/other')).toBe(true) // 闩锁他行 → 仍弹框
    // 协同口径：闩锁不是 arm 旁路——确认后续字若 armed 去重命中，闸照旧否决（不重复编排）
    expect(
      shouldArmSelectedRow({
        phaseReadyGit: true,
        path: WT_A,
        suppressed: [],
        riskConfirmationOpen: false,
        rowPresent: true,
        isMain: false,
        currentCwd: 'C:/elsewhere',
        draftIntent: true,
        currentSessionId: 's-armed',
        armedSessionId: 's-armed',
        armedPath: WT_A,
      }),
    ).toBe(false)
  })
})

describe('blankSessionIdByCwdOf（G4 官方四件套——与 plugin.ts 镜像同语义 pin）', () => {
  const ledger = (rows: Record<string, unknown>): unknown => ({ getSnapshot: () => ({ ids: Object.keys(rows), byId: rows }) })

  it('blank + cwd 归一命中 + workspace 归属 + 非归档；漂移件各自否决', () => {
    const rows = { a: { id: 'a', blank: true, cwd: 'C:/repo/wt-a' } }
    const ws = { items: [{ path: 'C:/repo/wt-a', sessionIds: ['a'] }], archivedSessionIds: [] }
    expect(blankSessionIdByCwdOf(ledger(rows), 'C:/Repo/WT-A/', ws)).toBe('a')
    expect(blankSessionIdByCwdOf(ledger(rows), 'C:/repo/wt-a', { ...ws, archivedSessionIds: ['a'] })).toBeUndefined()
    expect(blankSessionIdByCwdOf(ledger(rows), 'C:/repo/wt-a', { ...ws, items: [{ path: 'C:/repo/wt-a', sessionIds: ['x'] }] })).toBeUndefined()
    expect(blankSessionIdByCwdOf(ledger(rows), 'C:/repo/wt-a')).toBeUndefined() // 快照缺席 fail-closed
  })
})
