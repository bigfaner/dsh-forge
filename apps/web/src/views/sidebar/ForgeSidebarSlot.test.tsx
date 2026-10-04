// ForgeSidebarSlot 单测 —— 槽位接线层（AC1/AC2）：快照源经 useSyncExternalStore 直读
// （getServerSnapshot 第三参——SSR 面同源直读，零中间持有层）；owner share wide 透传。
// 项目 RPC 在 SSR 不跑 effect → 恒骨架相位；就绪树派生 = sidebar-model.test、面板相位 =
// ForgeWorkspacePanel.test 各自覆盖（行级断言不在此重复）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ForgeSidebarSlot } from './ForgeSidebarSlot.js'
import type {
  LedgerSessionRow,
  LedgerSessionsSnapshot,
  LedgerWorkspacesSnapshot,
  SnapshotSource,
} from './sidebar-model.js'

const NOW = 1_700_000_000_000
const realDateNow = Date.now

function fakeSource<T>(snap: T): SnapshotSource<T> {
  return { getSnapshot: () => snap, subscribe: () => () => {} }
}

function ledger(rows: readonly LedgerSessionRow[], overrides: Partial<LedgerSessionsSnapshot> = {}): LedgerSessionsSnapshot {
  return {
    ids: rows.map((r) => r.id),
    byId: Object.fromEntries(rows.map((r) => [r.id, r])),
    phase: 'ready',
    ...overrides,
  }
}

const workspacesSnap: LedgerWorkspacesSnapshot = { items: [{ workspaceId: 'w1', sessionIds: ['s1'] }] }

function renderSlot(sessions: LedgerSessionsSnapshot): string {
  return renderToStaticMarkup(
    <ForgeSidebarSlot
      wide
      expandSidebar={() => {}}
      sessions={fakeSource(sessions)}
      workspaces={fakeSource(workspacesSnap)}
      openSession={() => {}}
    />,
  )
}

describe('ForgeSidebarSlot（槽位接线层）', () => {
  it('宽态骨架：项目 RPC 在途骨架（SSR 无 effect；fix-25 知识入口迁官方 panellist 行）', () => {
    Date.now = () => NOW
    try {
      const markup = renderSlot(ledger([]))
      expect(markup).toContain('data-dswf-sidebar="wide"')
      expect(markup).not.toContain('data-dswf-nav="knowledge"')
      expect(markup).toContain('data-dswf-skeleton')
    } finally {
      Date.now = realDateNow
    }
  })

  it('项目区「＋」入口在场（UF-3 流程打开缝接线——槽位层绑定 openAddProjectFlow）', () => {
    Date.now = () => NOW
    try {
      const markup = renderSlot(ledger([]))
      expect(markup).toContain('data-dswf-nav="add-project"')
      expect(markup).toContain('aria-label="添加项目"')
    } finally {
      Date.now = realDateNow
    }
  })

  it('rail 态：owner share wide=false 透传（壳收展机制继承）', () => {
    const markup = renderToStaticMarkup(
      <ForgeSidebarSlot
        wide={false}
        expandSidebar={() => {}}
        sessions={fakeSource(ledger([]))}
        workspaces={fakeSource(workspacesSnap)}
        openSession={() => {}}
      />,
    )
    expect(markup).toContain('data-dswf-sidebar="rail"')
  })
})
