// 召回基线测试基建（knowledge-stage2-write-gateway/1.7——提案 §2.5）：
// 临时装配自持库 + 真实 .knowledge 语料（121 篇收编快照）→ 服务面 search Top-5 判分。
// 零污染起步：跑批全部落在临时目录临时库，绝不触宿主/仓内任何持久层。
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { openKnowledgeDatabase } from '../../../packages/plugins/knowledge/src/storage/open.js'
import { createKnowledgeRegistry } from '../../../packages/plugins/knowledge/src/storage/registry.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/service.js'
import type { BrowseKnowledgeService } from '../../../packages/plugins/knowledge/src/service/types.js'

/** 本文件所在目录（tests/knowledge/recall-baseline） */
export const baselineDir = dirname(fileURLToPath(import.meta.url))

/** 仓根（.knowledge 语料所在） */
export const repoRoot = join(baselineDir, '..', '..', '..')

export interface BaselineMount {
  readonly service: BrowseKnowledgeService
  readonly db: Database.Database
  readonly projectId: string
  readonly sessionId: string
  readonly knowledgeDir: string
  /** rebuild 入索引条目数（语料快照规模自证） */
  readonly indexed: number
  close(): void
}

const mounts: BaselineMount[] = []

/** 临时装配：复制仓内 .knowledge 真实语料 → 自持库 + 注册行 + rebuild + 服务面 */
export async function mountRealCorpus(sessionId = 'recall-baseline'): Promise<BaselineMount> {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-recall-baseline-'))
  const wsDir = join(root, 'ws')
  const knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(wsDir, { recursive: true })
  cpSync(join(repoRoot, '.knowledge'), knowledgeDir, { recursive: true })

  const projectId = 'p-recall-baseline'
  const db = openKnowledgeDatabase(join(root, 'knowledge.db'))
  const registry = createKnowledgeRegistry(db)
  registry.upsert(wsDir, knowledgeDir)
  const service = createKnowledgeService({
    db,
    resolveWsPath: (pid) => (pid === projectId ? wsDir : undefined),
  })
  const report = await service.rebuildIndex(projectId)
  const mount: BaselineMount = {
    service,
    db,
    projectId,
    sessionId,
    knowledgeDir,
    indexed: report.indexed,
    close: () => {
      db.close()
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    },
  }
  mounts.push(mount)
  return mount
}

export function disposeMounts(): void {
  for (const m of mounts.splice(0)) m.close()
}
