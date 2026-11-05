// 单测 —— knowledge_supersede tool 跨项目归并校验 tool 面实测（followups #3）。
// service 层 O2（distill-integration CT-DI 跨项目分支）之外，本套钉 tool execute 分支：
// 真实服务面（自持存储 + createKnowledgeService）+ 真实 tool 装配（createSupersedeTool +
// createProjectResolver），winner/loser 分属两个项目域 → tool.execute 返回
// cas-failed/cross-project 回执（非裸错），业务台账零行、loser 正本零触碰。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startSelfHostedStorage } from '../storage/start.js'
import { createKnowledgeService } from '../service/index.js'
import type { KnowledgeWriteQuery } from '../service/index.js'
import { createProjectResolver, createWsPathResolver } from './session.js'
import { createSupersedeTool } from './supersede.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-j-xproj-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

function writeQ(partial: Partial<KnowledgeWriteQuery> = {}): KnowledgeWriteQuery {
  return {
    projectId: 'p-PLACEHOLDER',
    title: 'Cross Project Doc',
    summary: '跨域摘要',
    keywords: ['cross'],
    body: '# 内容\n\n跨项目归并校验。',
    necessity: { stable: true, nonTrivial: true, value: true },
    ...partial,
  }
}

describe('knowledge_supersede tool execute 跨项目归并校验（followups #3——tool 面实测）', () => {
  it('winner/loser 分属两个项目域 → cas-failed/cross-project 回执 + 台账零行 + loser 正本零触碰', async () => {
    const root = tmpRoot()
    const wsA = join(root, 'ws-a')
    const wsB = join(root, 'ws-b')
    const dirA = join(wsA, '.knowledge')
    const dirB = join(wsB, '.knowledge')
    const storage = startSelfHostedStorage({ dbFile: join(root, 'knowledge', 'knowledge.db') })!
    try {
      storage.registry.upsert(wsA, dirA)
      storage.registry.upsert(wsB, dirB)
      const bindings = [
        { wsPath: wsA, projectId: 'p-a' },
        { wsPath: wsB, projectId: 'p-b' },
      ]
      const service = createKnowledgeService({ db: storage.db, resolveWsPath: createWsPathResolver(bindings) })

      // loser 落 A 项目域；winner 落 B 项目域（v4 实体表全局无项目键——域归属按版本文件落位判定）
      const loser = await service.write(writeQ({ projectId: 'p-a', title: 'Loser In Project A' }))
      if (loser.outcome !== 'written') throw new Error('loser 未写入')
      const winner = await service.write(writeQ({ projectId: 'p-b', title: 'Winner In Project B' }))
      if (winner.outcome !== 'written') throw new Error('winner 未写入')

      // tool 装配：会话绑定 wsA（agent 视角在 A 项目内发起归并，winner 却属 B 域）
      const tool = createSupersedeTool({ knowledge: service, resolveProjectId: createProjectResolver(bindings) })
      const exec = { agent: { session: { id: 'sess-x', header: { cwd: wsA } } } }
      const out = await tool.execute({ winner_id: winner.id, loser_id: loser.id, reason: '误判重复对' }, exec)

      expect(out).toMatchObject({ outcome: 'cas-failed', loserId: loser.id, reason: 'cross-project' })
      const ledgerRows = storage.db
        .prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM knowledge_supersede_ledger`)
        .get()?.n
      expect(ledgerRows).toBe(0) // 业务台账零行（拒绝路径不落账）
      const loserRow = storage.db
        .prepare<[string], { merged_into: string | null }>(`SELECT merged_into FROM knowledge_entries WHERE id = ?`)
        .get(loser.id)
      expect(loserRow?.merged_into).toBeNull() // 投影零污染

      // 回执 render 呈现拒因（agent 可读，非裸错）
      const text = tool.output.render({}, out)[0]?.text ?? ''
      expect(text).toContain('cas-failed (cross-project)')

      // 同域对照组：winner/loser 同落 A 域 → merged（证明上例拒绝源于跨项目校验而非其它前置）
      const winnerA = await service.write(writeQ({ projectId: 'p-a', title: 'Winner Also In A' }))
      if (winnerA.outcome !== 'written') throw new Error('winnerA 未写入')
      const ok = await tool.execute({ winner_id: winnerA.id, loser_id: loser.id, reason: '同域重复对' }, exec)
      expect(ok).toMatchObject({ outcome: 'merged', winnerId: winnerA.id, loserId: loser.id })
      expect(
        storage.db
          .prepare<unknown[], { n: number }>(
            `SELECT COUNT(*) AS n FROM knowledge_supersede_ledger WHERE loser_id = '${loser.id}'`,
          )
          .get()?.n,
      ).toBe(1)
    } finally {
      storage.close()
    }
  })

  it('loser 正本零触碰实据：跨项目拒绝后 loser 文件无 merged_into frontmatter', async () => {
    const root = tmpRoot()
    const wsA = join(root, 'ws-a')
    const wsB = join(root, 'ws-b')
    const storage = startSelfHostedStorage({ dbFile: join(root, 'knowledge', 'knowledge.db') })!
    try {
      storage.registry.upsert(wsA, join(wsA, '.knowledge'))
      storage.registry.upsert(wsB, join(wsB, '.knowledge'))
      const bindings = [
        { wsPath: wsA, projectId: 'p-a' },
        { wsPath: wsB, projectId: 'p-b' },
      ]
      const service = createKnowledgeService({ db: storage.db, resolveWsPath: createWsPathResolver(bindings) })
      const loser = await service.write(writeQ({ projectId: 'p-a', title: 'Untouched Loser' }))
      if (loser.outcome !== 'written') throw new Error('loser 未写入')
      const winner = await service.write(writeQ({ projectId: 'p-b', title: 'Foreign Winner' }))
      if (winner.outcome !== 'written') throw new Error('winner 未写入')

      const loserFile = storage.db
        .prepare<[string], { file_path: string }>(
          `SELECT file_path FROM knowledge_entry_versions WHERE id = ? ORDER BY version_ts DESC LIMIT 1`,
        )
        .get(loser.id)!.file_path
      const before = readFileSync(loserFile, 'utf8')

      const tool = createSupersedeTool({ knowledge: service, resolveProjectId: createProjectResolver(bindings) })
      const exec = { agent: { session: { id: 'sess-y', header: { cwd: wsA } } } }
      const out = await tool.execute({ winner_id: winner.id, loser_id: loser.id }, exec)
      expect(out).toMatchObject({ outcome: 'cas-failed', reason: 'cross-project' })
      expect(readFileSync(loserFile, 'utf8')).toBe(before) // 正本逐字未动
      expect(before).not.toContain('merged_into')
    } finally {
      storage.close()
    }
  })
})
