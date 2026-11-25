// 召回基线测试基建（knowledge-stage2-write-gateway/1.7——提案 §2.5）：
// 临时装配自持库 + 真实 .knowledge 语料（121 篇收编快照）→ 服务面 search Top-5 判分。
// 零污染起步：跑批全部落在临时目录临时库，绝不触宿主/仓内任何持久层。
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from '@dsh-forge/lib-db'
import { openKnowledgeDatabase } from '../../../plugins/knowledge/host/storage/open.js'
import { createKnowledgeRegistry } from '../../../plugins/knowledge/host/storage/registry.js'
import { createKnowledgeService } from '../../../plugins/knowledge/host/service/service.js'
import type { BrowseKnowledgeService } from '../../../plugins/knowledge/host/service/types.js'

/** 本文件所在目录（tests/knowledge/recall-baseline——语料快照 corpus/.knowledge 同目录锚定） */
export const baselineDir = dirname(fileURLToPath(import.meta.url))

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

/** 临时装配：复制仓内固定语料快照（corpus/.knowledge——活 .knowledge 会随知识系统
 * 写入漂移：确认状态/新增条目使固定题集失配——快照锚定收编时点，题集/快照同仓同批演进）→
 * 自持库 + 注册行 + rebuild + 服务面 */
export async function mountRealCorpus(sessionId = 'recall-baseline'): Promise<BaselineMount> {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-recall-baseline-'))
  const wsDir = join(root, 'ws')
  const knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(wsDir, { recursive: true })
  cpSync(join(baselineDir, 'corpus', '.knowledge'), knowledgeDir, { recursive: true })

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
