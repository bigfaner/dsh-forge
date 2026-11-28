// §2.8 散点收编 core 消费面等价断言（plugin-project 1.6：dir-segments 本体迁 lib/path 后，
// core 侧 defaultWorktreeDir / schema SQL 段名等价断言随 core 本体留位——与收编前
// node:path join / 裸字面形态逐字节一致）。
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FORGE_DIR_SEGMENT } from '@dsh-forge/lib-api/forge-dir-segments'
import { docsRootOfForgeDir, forgeDirOfWorkspace } from '@dsh-forge/lib-path'
import { defaultWorktreeDir } from '../project-service.js'
import { WORKTREE_DIR_BACKFILL_SQL } from '../../db/schema.js'

const WS = 'C:\\ws\\proj'

describe('§2.8 core 消费面收编等价（AC2）', () => {
  it('defaultWorktreeDir === join(wsPath, .forge, worktrees)（project-service:117）', () => {
    expect(defaultWorktreeDir(WS)).toBe(join(WS, '.forge', 'worktrees'))
  })

  it('core 消费 lib/path 派生等价（discovery/worker-context/project-service 消费面）', () => {
    expect(docsRootOfForgeDir(`${WS}\\.forge`)).toBe(join(WS, '.forge', 'docs'))
    expect(forgeDirOfWorkspace(WS)).toBe(join(WS, '.forge'))
  })

  it('WORKTREE_DIR_BACKFILL_SQL 段名与收编前逐字节一致（schema:36）', () => {
    expect(WORKTREE_DIR_BACKFILL_SQL).toContain(`|| '${FORGE_DIR_SEGMENT}'`)
    expect(WORKTREE_DIR_BACKFILL_SQL).toBe(
      `UPDATE projects SET worktree_dir =
    ws_path
    || (CASE WHEN instr(ws_path, '\\') > 0 THEN '\\' ELSE '/' END)
    || '.forge'
    || (CASE WHEN instr(ws_path, '\\') > 0 THEN '\\' ELSE '/' END)
    || 'worktrees'
  WHERE worktree_dir = ''`,
    )
  })
})
