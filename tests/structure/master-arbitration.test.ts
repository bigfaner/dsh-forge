// INV-U 选主谓词统一契约测试（bug 0c677db2——ef8b3a45 家族成因形态残余）：
// wrap 面（start-session-wrap selectMasterRow）与 host 面（worktree-identity resolveProject）
// 同锚集合必须裁出同一主行。统一契约 = 「主树行必胜」（host 主树锚判为准，wrap 镜像同构：
// 主树路径是同仓 worktree 行的祖先前缀 ⇔ 锚 realpath(git-common-dir) 恒坐落在主树内）；
// createdAt 只是实现近似（主树判缺席时的残留重复行仲裁）。判据书面化正本：
// docs/conventions/official-face-contract-anchors.md（契约锚台账 INV-U 行）。
// 成立域限定（M1）：两侧判据等价以「worktree 全在主树子树内」为前提（外置 worktree_dir
// 分叉域）；另设祖先非 git 注册根行劫持分叉域（host isGenuineGitRoot 守卫单侧兜底，
// wrap 面零探针不加复核）——分叉域书面化见正本 M1 节。
//
// 跨端直引先例：tests/structure/installer-pipeline.test.ts（apps/host 源面直引）。
import { describe, expect, it } from 'vitest'
import { normalizeFsPath } from '../../packages/path-key/src/index.js'
import { createWorktreeIdentity, type ForgeProjectsIdentityFace } from '../../apps/host/src/ipc/worktree-identity.js'
import { selectMasterRow } from '../../apps/web/src/client-plugin/start-session-wrap.js'

const ROOT = 'C:/repo'
const WT_A = 'C:/repo/.forge/worktrees/wt-a'
const WT_B = 'C:/repo/.forge/worktrees/wt-b'
const ANCHOR = 'C:/repo/.git'

/** git 探针桩（同锚集合：主树 ROOT + 附属 worktree WT_A/WT_B，锚 = <主树>/.git） */
const gitStub = {
  commonDirAnchor: async (dir: string): Promise<string | null> =>
    normalizeFsPath(dir) === normalizeFsPath(ROOT) || normalizeFsPath(dir) === normalizeFsPath(WT_A) || normalizeFsPath(dir) === normalizeFsPath(WT_B)
      ? ANCHOR
      : null,
  worktrees: async (): Promise<readonly { readonly path: string }[] | null> => [
    { path: ROOT },
    { path: WT_A },
    { path: WT_B },
  ],
}

function stubProjects(rows: { id: string; wsPath: string; name?: string }[]): ForgeProjectsIdentityFace {
  return {
    async listProjects() {
      return rows.map((r) => ({ id: r.id, workspaceId: 'w', name: r.name ?? 'n', wsPath: r.wsPath, archived: false }))
    },
    async getProject() {
      return null
    },
  }
}

describe('INV-U 选主谓词统一契约（bug 0c677db2：同锚集合两半边裁决恒一致）', () => {
  it('分歧形态：同锚集合 {残留 worktree 行(createdAt 新, 前置), 主树行(createdAt 旧)} → 两半边均裁主树行', async () => {
    // host 半边：resolveProject（未注册树 cwd 走锚匹配——created_at 序残留行在前不劫持）
    const identity = createWorktreeIdentity(
      stubProjects([
        { id: 'p-wt-old', wsPath: WT_A, name: 'old-worktree' },
        { id: 'p-main', wsPath: ROOT, name: 'main' },
      ]),
      gitStub,
    )
    const resolved = await identity.resolveProject(WT_B)
    expect(resolved?.projectId).toBe('p-main')

    // wrap 半边：selectMasterRow 同集合（残留行 createdAt 更新且前置）——旧 createdAt-最新
    // 谓词会裁残留 worktree 行（与 host 主树锚判分叉 = bug 形态），统一后主树行必胜
    const master = selectMasterRow(
      [
        { workspaceId: 'ws-wt-old', path: WT_A, sessionIds: [], createdAt: '2026-06-01T00:00:00Z' },
        { workspaceId: 'ws-main', path: ROOT, sessionIds: [], createdAt: '2026-01-01T00:00:00Z' },
      ],
      () => true,
    )
    expect(master?.workspaceId).toBe('ws-main')
  })

  it('反向序：同锚集合 {主树行(createdAt 旧, 前置), worktree 行(createdAt 新, 后置)} → 主树行必胜（bug 143328f1——后继非主树行不得凭 createdAt 翻盘）', async () => {
    // host 半边：resolveProject 锚匹配——主树行前置时按精确/锚判命中，worktree 行后置不翻盘
    const identity = createWorktreeIdentity(
      stubProjects([
        { id: 'p-main', wsPath: ROOT, name: 'main' },
        { id: 'p-wt-new', wsPath: WT_A, name: 'new-worktree' },
      ]),
      gitStub,
    )
    expect(await identity.resolveProject(WT_B)).toMatchObject({ projectId: 'p-main' })

    // wrap 半边：主树行前置占位后，后置新 worktree 行落入 createdAt 通用分支翻盘 = bug 形态
    const master = selectMasterRow(
      [
        { workspaceId: 'ws-main', path: ROOT, sessionIds: [], createdAt: '2026-01-01T00:00:00Z' },
        { workspaceId: 'ws-wt-new', path: WT_A, sessionIds: [], createdAt: '2026-07-01T00:00:00Z' },
      ],
      () => true,
    )
    expect(master?.workspaceId).toBe('ws-main')
  })

  it('createdAt 平手：主树判缺席 → 快照序首行胜（统一契约③——三态补齐：在场/缺席/平手）', () => {
    // 主树行在场：平手不翻盘（主树行必胜不依赖 createdAt）
    const withMaster = selectMasterRow(
      [
        { workspaceId: 'ws-main', path: ROOT, sessionIds: [], createdAt: '2026-01-01T00:00:00Z' },
        { workspaceId: 'ws-wt', path: WT_A, sessionIds: [], createdAt: '2026-01-01T00:00:00Z' },
      ],
      () => true,
    )
    expect(withMaster?.workspaceId).toBe('ws-main')

    // 主树行缺席：同 createdAt 平手 → 快照序首行（确定性序——INV-R 幂等）
    const noMaster = selectMasterRow(
      [
        { workspaceId: 'ws-wt-a', path: WT_A, sessionIds: [], createdAt: '2026-06-01T00:00:00Z' },
        { workspaceId: 'ws-wt-a-dup', path: WT_A, sessionIds: [], createdAt: '2026-06-01T00:00:00Z' },
      ],
      () => true,
    )
    expect(noMaster?.workspaceId).toBe('ws-wt-a')
  })

  it('主树判缺席（多 worktree 行互不为祖先）→ 同锚集合退 createdAt 仲裁（统一契约②——两半边同退路）', async () => {
    // host 半边：无主树行注册（仅 worktree 行）→ 锚匹配首个真 git 行（created_at 序首行）
    const identity = createWorktreeIdentity(stubProjects([{ id: 'p-wt', wsPath: WT_A, name: 'wt' }]), gitStub)
    expect(await identity.resolveProject(WT_B)).toMatchObject({ projectId: 'p-wt' })

    // wrap 半边：主树行缺席 → createdAt 最新（残留重复行仲裁既有语义零回归）
    const master = selectMasterRow(
      [
        { workspaceId: 'ws-wt-a', path: WT_A, sessionIds: [], createdAt: '2026-06-01T00:00:00Z' },
        { workspaceId: 'ws-wt-a-new', path: WT_A, sessionIds: [], createdAt: '2026-07-01T00:00:00Z' },
      ],
      () => true,
    )
    expect(master?.workspaceId).toBe('ws-wt-a-new')
  })
})
