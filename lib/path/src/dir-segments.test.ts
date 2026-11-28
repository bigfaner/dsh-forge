// §2.8 散点收编等价断言（逐字节等价——每收编点一条）。plugin-project 1.6 随本体 git mv
// 迁入 lib/path；core 侧消费面等价断言（defaultWorktreeDir / schema SQL 段名）随 core 本体
// 留在 packages/core/src/forge/workspace/dir-segments.test.ts。
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FORGE_DIR_SEGMENT, FORGE_LOGS_DIR } from '@dsh-forge/lib-api/forge-dir-segments'
import { joinDirSegment } from './path-key.js'
import { docsRootOfForgeDir, forgeDirOfWorkspace, workspaceDocsRoot } from './dir-segments.js'

const WS = 'C:\\ws\\proj'

describe('§2.8 收编等价（AC2——dir-segments 薄组合面）', () => {
  it('docsRoot 派生等价：docsRootOfForgeDir / workspaceDocsRoot', () => {
    expect(docsRootOfForgeDir(`${WS}\\.forge`)).toBe(join(WS, '.forge', 'docs'))
    expect(workspaceDocsRoot(WS)).toBe(join(WS, '.forge', 'docs'))
  })

  it('forgeDirOfWorkspace / joinDirSegment === node join（段名单源常量在场）', () => {
    expect(forgeDirOfWorkspace(WS)).toBe(join(WS, '.forge'))
    expect(joinDirSegment(WS, 'tmp')).toBe(join(WS, 'tmp'))
    expect(FORGE_DIR_SEGMENT).toBe('.forge')
    expect(FORGE_LOGS_DIR).toBe('logs')
  })
})
