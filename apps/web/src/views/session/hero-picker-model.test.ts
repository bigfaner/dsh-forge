// hero-picker-model 单测（fix-24 ① AC5）——项目映射纯函数三口径：
// workspaceId↔project 映射 / archived 排除 / 空集（添加唯一入口 + 直达判据）。
// W3 arm 退役后本文件只剩映射面 + 1.34 确认闩锁（点选时点确认语义）。
import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@dsh-forge/contracts'
import {
  heroPickerPlan,
  heroDefaultPickId,
  heroDefaultPickReady,
  selectedProjectOf,
  selectedProjectRootOf,
  selectedProjectRootStrictOf,
  riskDialogNeeded,
  riskLatchConfirm,
  riskLatchReselect,
  staleSelectionResetOf,
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
  it('行集 = 项目（id=workspaceId、name=label、wsPath=树 ws 判据源——bug 9eb9d6cb）；archived 排除（过滤口径与左栏一致）', () => {
    const plan = heroPickerPlan(PROJECTS, true)
    expect(plan.rows).toEqual([
      { id: 'w-1', name: 'alpha', wsPath: 'C:\\ws\\p1' },
      { id: 'w-2', name: 'beta', wsPath: 'C:\\ws\\p2' },
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
    expect(selectedProjectOf(rows, 'w-2')).toEqual({ id: 'w-2', name: 'beta', wsPath: 'C:\\ws\\p2' })
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

describe('selectedProjectRootStrictOf（严格段——兜底禁止泄漏为数据源）', () => {
  it('selectedId 命中项目 → ws_path（与 selectedProjectRootOf 首段一致）', () => {
    expect(selectedProjectRootStrictOf(PROJECTS, 'w-2')).toBe('C:\\ws\\p2')
  })

  it('selectedId 未命中/缺席 → null（即便存在其他活跃项目——渲染兜底不消费严格段）', () => {
    expect(selectedProjectRootStrictOf(PROJECTS, 'w-native-unbound')).toBeNull()
    expect(selectedProjectRootStrictOf(PROJECTS, undefined)).toBeNull()
    expect(selectedProjectRootStrictOf(PROJECTS, 'w-3')).toBeNull() // archived 亦不充当数据根
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

// ───────────── bug 2ba146d8：hero 默认拾取链（项目 chip 缺省选中第一个活跃项目）──
describe('heroDefaultPickId（bug 2ba146d8 默认拾取——归档会话回 hero 项目 chip 不得空选中）', () => {
  it('bug: 无选中（归档会话回 hero/冷启）+ 活跃项目在场 → 默认拾取第一个活跃项目行', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows
    expect(heroDefaultPickId(rows, undefined)).toBe('w-1')
  })

  it('bug: 选中态未命中行集（未绑定工作区/已归档项目——归档行不可锚定既有语义）→ 默认拾取第一个活跃项目行', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows
    expect(heroDefaultPickId(rows, 'w-native-unbound')).toBe('w-1')
    expect(heroDefaultPickId(rows, 'w-3')).toBe('w-1')
  })

  it('已命中行集 → 不拾取（undefined——用户显式选中态零覆盖）', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows
    expect(heroDefaultPickId(rows, 'w-2')).toBeUndefined()
  })

  it('空行集（无活跃项目）→ 不拾取（undefined——零项目直达添加流现状）', () => {
    expect(heroDefaultPickId([], undefined)).toBeUndefined()
  })

  // ── bug 9eb9d6cb：树 workspace 选中态 = 合法选中（A2 后会话可绑树 ws，永不命中项目行）──
  const WSR = (workspaceId: string, path: string) => ({ workspaceId, path })
  it('bug: selectedId 命中官方 workspace 行且 path 在活跃项目根下（树 ws）→ 不拾取（合法选中零覆盖）', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows // 活跃根 = C:/ws/p1、C:/ws/p2
    const wsRows = [WSR('w-tree', 'C:/ws/p1/.forge/worktrees/super-composer')]
    expect(heroDefaultPickId(rows, 'w-tree', wsRows)).toBeUndefined()
  })

  it('bug: 树 ws 判据只认活跃项目根下路径——外部 workspace（他 repo 根）维持现状拾取', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows
    expect(heroDefaultPickId(rows, 'w-external', [WSR('w-external', 'D:/other-repo')])).toBe('w-1')
  })

  it('bug: 判据数据缺席（官方快照未到）→ 现状行为（d353536f 在场门兜住不盲拾取）', () => {
    const rows = heroPickerPlan(PROJECTS, true).rows
    expect(heroDefaultPickId(rows, 'w-tree')).toBe('w-1')
  })
})

// ───────────── bug d353536f：默认拾取官方基线在场门（刷新后基线未就位盲拾取 → 官方
// connectWorkspace 查空快照抛 unknown workspace toast）─────────────
describe('heroDefaultPickReady（bug d353536f 在场门——官方 workspaces 快照含目标才放行拾取）', () => {
  const ITEMS = [{ workspaceId: 'w-1' }, { workspaceId: 'w-2' }]

  it('bug: 目标已入官方快照 → 放行拾取 id（基线就位后拾取零等待惩罚）', () => {
    expect(heroDefaultPickReady(ITEMS, 'w-1')).toBe('w-1')
  })

  it('bug: 目标未入官方快照（基线未达/流未开）→ undefined 不盲拾取（盲拾取 = connectWorkspace 必抛 unknown workspace）', () => {
    expect(heroDefaultPickReady([{ workspaceId: 'w-other' }], 'w-1')).toBeUndefined()
    expect(heroDefaultPickReady([], 'w-1')).toBeUndefined()
  })

  it('官方快照缺席（非壳载体/形状漂移 null）→ undefined（拾取前置事实不可证 = 不拾取）', () => {
    expect(heroDefaultPickReady(null, 'w-1')).toBeUndefined()
    expect(heroDefaultPickReady(undefined, 'w-1')).toBeUndefined()
  })

  it('无默认拾取目标 → undefined（heroDefaultPickId 已判空的直通面）', () => {
    expect(heroDefaultPickReady(ITEMS, undefined)).toBeUndefined()
  })
})

// ───────────── 1.34 跨分支确认闩锁（bug ccfcc103）——消费时点 = 点选（1.19 语义回归）──
describe('riskLatch（bug ccfcc103 确认闩锁——置位/清退/弹框判定）', () => {
  const WT_A = 'C:/repo/.forge/worktrees/wt-a'

  it('置位：确认即置位（null→path），重复确认幂等（零重弹锚点）', () => {
    expect(riskLatchConfirm(null, WT_A)).toBe(WT_A)
    expect(riskLatchConfirm(WT_A, WT_A)).toBe(WT_A)
    expect(riskLatchConfirm('C:/other', WT_A)).toBe(WT_A) // 换确认目标覆盖
  })

  it('清退：换目标重选即清（重新判定）；同行重选保留（确认后点 chip 不重弹）', () => {
    expect(riskLatchReselect(WT_A, WT_A)).toBe(WT_A) // 同行重选不清
    expect(riskLatchReselect(WT_A, 'C:/other')).toBeNull() // 换目标 → 清，重新判定
    expect(riskLatchReselect(null, WT_A)).toBeNull()
  })

  it('弹框判定：未闩 → 需弹框；已闩 → 零重弹；闩锁他行 → 仍弹框（闩锁只旁路弹框分支）', () => {
    expect(riskDialogNeeded(WT_A, null)).toBe(true) // 未确认 → 弹框
    expect(riskDialogNeeded(WT_A, WT_A)).toBe(false) // 已确认闩锁 → 零重弹
    expect(riskDialogNeeded(WT_A, 'C:/other')).toBe(true) // 闩锁他行 → 仍弹框
  })
})

// ───────────── bug 4a30b193 陈旧选中自愈判定（纯函数单源）─────────────
describe('staleSelectionResetOf（bug 4a30b193 陈旧选中自愈判定）', () => {
  const rows = [
    { path: 'C:/repo', worktreeName: 'repo', isMain: true, present: true },
    { path: 'C:/repo/.forge/worktrees/wt-a', worktreeName: 'wt-a', isMain: false, present: true },
  ]

  it('选中行盘上缺席（present=false，git 陈旧清单行）→ stale + 树名引述 + 主行回落', () => {
    const goneRows = [rows[0]!, { ...rows[1]!, present: false }] // wt-a 行在（git 未 prune）但盘上已删
    const plan = staleSelectionResetOf(goneRows, goneRows[1]!.path)
    expect(plan).toEqual({ stale: true, worktreeName: 'wt-a', mainPath: 'C:/repo' })
  })

  it('选中行整段消失（清单无行——prune 后）→ stale + 树名取路径尾段', () => {
    const plan = staleSelectionResetOf(rows, 'C:/repo/.forge/worktrees/gone')
    expect(plan).toEqual({ stale: true, worktreeName: 'gone', mainPath: 'C:/repo' })
  })

  it('健康选中 / 无选中 → 不自愈（用户显式选中零覆盖）', () => {
    expect(staleSelectionResetOf(rows, 'C:/repo/.forge/worktrees/wt-a')).toEqual({ stale: false })
    expect(staleSelectionResetOf(rows, undefined)).toEqual({ stale: false })
  })

  it('清单无主行（退化清单）→ stale 但 mainPath 缺席（装配层仅清选中态）', () => {
    const noMain = [{ path: 'C:/x', worktreeName: 'x', isMain: false, present: true }]
    const plan = staleSelectionResetOf(noMain, 'C:/gone')
    expect(plan).toEqual({ stale: true, worktreeName: 'gone', mainPath: undefined })
  })
})
