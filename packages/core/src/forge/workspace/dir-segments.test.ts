// §2.8 散点收编 core 面 AC2 等价断言（逐字节等价——每收编点一条）：
// defaultWorktreeDir（project-service）/ docsRoot 派生（discovery/worker-context 消费）/
// schema SQL 段名——全部与收编前 node:path join / 裸字面形态逐字节一致（平台原生拼写）。
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FORGE_DIR_SEGMENT,
  FORGE_LOGS_DIR,
} from '@dsh-forge/contracts'
import { joinDirSegment } from '@dsh-forge/path-key'
import { docsRootOfForgeDir, forgeDirOfWorkspace, workspaceDocsRoot } from './dir-segments.js'
import { defaultWorktreeDir } from '../project-service.js'
import { WORKTREE_DIR_BACKFILL_SQL } from '../../db/schema.js'

const WS = 'C:\\ws\\proj'

describe('§2.8 core 面收编等价（AC2）', () => {
  it('defaultWorktreeDir === join(wsPath, .forge, worktrees)（project-service:117）', () => {
    expect(defaultWorktreeDir(WS)).toBe(join(WS, '.forge', 'worktrees'))
  })

  it('docsRoot 派生等价：docsRootOfForgeDir / workspaceDocsRoot（discovery/worker-context 消费）', () => {
    expect(docsRootOfForgeDir(`${WS}\\.forge`)).toBe(join(WS, '.forge', 'docs'))
    expect(workspaceDocsRoot(WS)).toBe(join(WS, '.forge', 'docs'))
  })

  it('forgeDirOfWorkspace / joinDirSegment === node join（段名单源常量在场）', () => {
    expect(forgeDirOfWorkspace(WS)).toBe(join(WS, '.forge'))
    expect(joinDirSegment(WS, 'tmp')).toBe(join(WS, 'tmp'))
    expect(FORGE_DIR_SEGMENT).toBe('.forge')
    expect(FORGE_LOGS_DIR).toBe('logs')
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
