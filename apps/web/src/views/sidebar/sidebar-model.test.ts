// sidebar-model 单测 —— UF-1 项目树/会话列表派生（AC2：项目树读 forge:projects/list、
// 会话列表实时读 dsh 账本；AC5：空态判据输入）。纯函数面：快照进、视图行出、零持有。
import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@dsh-forge/contracts'
import {
  buildSidebarTree,
  relativeTimeLabel,
  sessionDotState,
  sessionStatus,
  type LedgerSessionRow,
  type LedgerSessionsSnapshot,
  type LedgerWorkspacesSnapshot,
} from './sidebar-model.js'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

function project(id: string, workspaceId: string, overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return { id, workspaceId, name: `项目${id}`, wsPath: `Z:/w/${id}`, archived: false, ...overrides }
}

function ledgerRow(id: string, overrides: Partial<LedgerSessionRow> = {}): LedgerSessionRow {
  return { id, displayTitle: `会话${id}`, updatedAt: Date.now() - 5 * MIN, ...overrides }
}

function ledger(rows: readonly LedgerSessionRow[], overrides: Partial<LedgerSessionsSnapshot> = {}): LedgerSessionsSnapshot {
  return {
    ids: rows.map((r) => r.id),
    byId: Object.fromEntries(rows.map((r) => [r.id, r])),
    phase: 'ready',
    ...overrides,
  }
}

function workspaces(items: readonly { workspaceId: string; sessionIds: string[] }[]): LedgerWorkspacesSnapshot {
  return { items }
}

describe('sessionStatus / sessionDotState（状态点四态）', () => {
  it('优先级：用户注意 > 完成提醒 > 进行中 > 静默', () => {
    expect(sessionStatus(ledgerRow('a', { pendingInteraction: { kind: 'question' }, running: true }))).toBe('attention')
    expect(sessionStatus(ledgerRow('b', { completed: true, running: false }))).toBe('done')
    expect(sessionStatus(ledgerRow('c', { running: true }))).toBe('running')
    expect(sessionStatus(ledgerRow('d'))).toBe('idle')
  })
  it('映射官方 StateDot 语义（warning/done/ongoing/idle）', () => {
    expect(sessionDotState('attention')).toBe('warning')
    expect(sessionDotState('done')).toBe('done')
    expect(sessionDotState('running')).toBe('ongoing')
    expect(sessionDotState('idle')).toBe('idle')
  })
})

describe('relativeTimeLabel（相对时间，官方桶化 + zh 文案）', () => {
  const now = 1_700_000_000_000
  it('五桶 + 刚刚', () => {
    expect(relativeTimeLabel(now - 30_000, now)).toBe('刚刚')
    expect(relativeTimeLabel(now - 5 * MIN, now)).toBe('5 分钟前')
    expect(relativeTimeLabel(now - 3 * HOUR, now)).toBe('3 小时前')
    expect(relativeTimeLabel(now - 2 * DAY, now)).toBe('2 天前')
    expect(relativeTimeLabel(now - 45 * DAY, now)).toBe('1 个月前')
    expect(relativeTimeLabel(now - 400 * DAY, now)).toBe('1 年前')
  })
})

describe('buildSidebarTree（项目树派生）', () => {
  it('项目序 = RPC 返回序；会话 = workspace 归属序 ∩ 账本（AC2）', () => {
    const out = buildSidebarTree({
      projects: [project('p1', 'w1'), project('p2', 'w2')],
      sessions: ledger([
        ledgerRow('s1', { updatedAt: 1 }),
        ledgerRow('s2', { updatedAt: 2 }),
        ledgerRow('s3', { updatedAt: 3 }),
      ]),
      workspaces: workspaces([
        { workspaceId: 'w1', sessionIds: ['s2', 's1'] },
        { workspaceId: 'w2', sessionIds: ['s3'] },
      ]),
    })
    expect(out.tree.map((n) => n.projectId)).toEqual(['p1', 'p2'])
    expect(out.tree[0]!.sessions.map((r) => r.sessionId)).toEqual(['s2', 's1'])
    expect(out.tree[1]!.sessions.map((r) => r.sessionId)).toEqual(['s3'])
    expect(out.tree[0]!.sessions[0]!.title).toBe('会话s2')
  })

  it('账本缺行的成员跳过；workspace 缺席 = 空会话项目；未注册 workspace 的会话不入树', () => {
    const out = buildSidebarTree({
      projects: [project('p1', 'w1')],
      // s-dead 在 workspace 成员表里但账本 byId 无行（缺行跳过）
      sessions: ledger([ledgerRow('s1'), ledgerRow('orphan')]),
      workspaces: workspaces([
        { workspaceId: 'w1', sessionIds: ['s1', 's-dead'] },
        { workspaceId: 'w-unregistered', sessionIds: ['orphan'] },
      ]),
    })
    expect(out.tree).toHaveLength(1)
    expect(out.tree[0]!.sessions.map((r) => r.sessionId)).toEqual(['s1'])
  })

  it('子代理行不入顶层；空白会话仅显示被选中者（官方浏览器口径）', () => {
    const out = buildSidebarTree({
      projects: [project('p1', 'w1')],
      sessions: ledger(
        [
          ledgerRow('s1'),
          ledgerRow('child', { parentId: 's1' }),
          ledgerRow('blank-a', { blank: true }),
          ledgerRow('blank-cur', { blank: true }),
        ],
        { current: 'blank-cur' },
      ),
      workspaces: workspaces([{ workspaceId: 'w1', sessionIds: ['s1', 'child', 'blank-a', 'blank-cur'] }]),
    })
    expect(out.tree[0]!.sessions.map((r) => r.sessionId)).toEqual(['s1', 'blank-cur'])
    expect(out.currentSessionId).toBe('blank-cur')
  })

  it('phase pending → loading 骨架相位；current 缺席 → null', () => {
    const out = buildSidebarTree({
      projects: [project('p1', 'w1')],
      sessions: ledger([], { phase: 'pending' }),
      workspaces: { items: [] },
    })
    expect(out.loading).toBe(true)
    expect(out.currentSessionId).toBeNull()
  })
})
