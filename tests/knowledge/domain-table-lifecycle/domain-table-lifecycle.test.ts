// @feature:knowledge
// Journey: domain-table-lifecycle（proposal knowledge-stage3-retrieval §2.2 C2 KNOWLEDGE_DOMAINS / 裁决 #7）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage3-retrieval/testing/journey-domain-table-lifecycle/contracts/contract.md
//   （CT-domain-table-lifecycle-01..06 ← journey DL-G1..G5 / DL-E1..E7）。
// 策略与锚实锚说明：
// · 真实装配链 = register/rebuildIndex 服务径 → SQLite（DDL v6 + 域对账与 entries 重建
//   同事务）→ 知识目录真实文件系统扫描；对账终态以行集相等判定（INV-2 可判定形式）。
// · 故障注入通道（CT-02 同事务回滚）：db.prepare 拦截（域对账 INSERT 语句就绪时点抛）——
//   事务内 entries 已重建而域对账未落的中途真失败，无半对账态即原子性证据。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { DiagEventPayload } from '../../../packages/contracts/src/index.js'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../../../packages/plugins/knowledge/src/storage/index.js'
import { downgradeKnowledgeSchema } from '../../../packages/plugins/knowledge/src/storage/schema.js'
import { rebuildKnowledgeIndex } from '../../../packages/plugins/knowledge/src/storage/rebuild.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/service.js'
import { createScanRegister } from '../../../packages/plugins/knowledge/src/service/scan-register.js'
import type { BrowseKnowledgeService } from '../../../packages/plugins/knowledge/src/service/types.js'

// ── 夹具 ──

const roots: string[] = []
function tmpRoot(tag: string): string {
  const root = mkdtempSync(join(tmpdir(), `knowledge-j-dl-${tag}-`))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

const BASE_TS = '2026-01-01T00:00:00.000Z'
function ts(i: number): string {
  return new Date(Date.parse(BASE_TS) + i).toISOString()
}

function put(knowledgeDir: string, domain: string, file: string, id: string, status = 'unconfirmed'): string {
  const dir = domain === '' ? knowledgeDir : join(knowledgeDir, ...domain.split('/'))
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, file)
  writeFileSync(
    filePath,
    [
      '---',
      `id: ${id}`,
      `title: T ${id}`,
      `status: ${status}`,
      'summary: s',
      'keywords: [k]',
      `version_ts: ${ts(id.length * 13 + file.length)}`,
      '---',
      '',
      '正文。',
      '',
    ].join('\n'),
    'utf8',
  )
  return filePath
}

interface World {
  root: string
  ws: string
  knowledgeDir: string
  db: Database.Database
  service: BrowseKnowledgeService
  projectId: string
  events: DiagEventPayload[]
}

function makeWorld(tag: string, withCorpus = true): World {
  const root = tmpRoot(tag)
  const ws = join(root, 'ws')
  const knowledgeDir = join(ws, '.knowledge')
  mkdirSync(knowledgeDir, { recursive: true })
  if (withCorpus) {
    put(knowledgeDir, 'dA', 'a1.md', 'dl-a1', 'confirmed')
    put(knowledgeDir, 'dA', 'a2.md', 'dl-a2', 'confirmed')
    put(knowledgeDir, 'dB', 'b1.md', 'dl-b1', 'confirmed')
  }
  const events: DiagEventPayload[] = []
  const db = openKnowledgeDatabase(join(root, 'knowledge', 'knowledge.db'))
  const projectId = `p-dl-${tag}`
  createKnowledgeRegistry(db).upsert(ws, knowledgeDir, projectId)
  const service = createKnowledgeService({ db, resolveWsPath: (id) => (id === projectId ? ws : undefined), emit: (p) => events.push(p) })
  return { root, ws, knowledgeDir, db, service, projectId, events }
}

interface DomainRow {
  readonly ws_path: string
  readonly domain: string
  readonly description: string | null
  readonly updated_at: string
}

function domainRows(db: Database.Database, wsPath?: string): DomainRow[] {
  const where = wsPath === undefined ? '' : ' WHERE ws_path = ?'
  const stmt = db.prepare<unknown[], DomainRow>(
    `SELECT ws_path, domain, description, updated_at FROM knowledge_domains${where} ORDER BY ws_path, domain`,
  )
  return wsPath === undefined ? stmt.all() : stmt.all(wsPath)
}

const rowKeys = (rows: readonly DomainRow[]): readonly (readonly string[])[] =>
  rows.map((r) => [r.ws_path, r.domain, r.description ?? '<NULL>', r.updated_at])

// ── CT-domain-table-lifecycle-01 对账三径（DL-G1/G3/G4/G5/DL-E7） ──

describe('CT-domain-table-lifecycle-01 对账三径：补行 / 保简介 / 超集清除（DL-G1/G3/G4/G5/E7）', () => {
  it('O1 补行（rebuild 补 dD 未登记域）；O2 保简介（dA description/updated_at 逐位不变）；O3 超集清除；O4 终态行集相等；O5 register 首跑同径', async () => {
    const w = makeWorld('ct01')
    const { db, service, ws, knowledgeDir, projectId } = w

    // O5 register 首跑批量初始化（DL-G1）：每个现存域补行（description NULL、updated_at 就位）
    const { registerKnowledge } = createScanRegister({ db })
    const out = await registerKnowledge({ wsPath: ws })
    expect(out.outcome).toBe('registered')
    const afterRegister = domainRows(db, ws)
    expect(afterRegister.map((r) => [r.domain, r.description])).toEqual([
      ['dA', null],
      ['dB', null],
    ])
    for (const r of afterRegister) expect(r.updated_at).toBeTruthy()

    // 人工简介落 dA + 有简介零条目对照域 retired
    await service.setDomainDescription({ wsPath: ws, domain: 'dA', description: '人工简介资产' })
    const at = domainRows(db, ws).find((r) => r.domain === 'dA')!
    db.prepare(`INSERT INTO knowledge_domains (ws_path, domain, description, updated_at) VALUES (?, 'retired', '有简介无条目', ?)`)
      .run(ws, BASE_TS)

    // O1 补行：文件系统手工放置未登记域 dD 条目（DL-E7）→ rebuild 扫描发现补行
    put(knowledgeDir, 'dD', 'd1.md', 'dl-d1', 'confirmed')
    // 超集清除前置：dB 条目归零（无简介域）
    rmSync(join(knowledgeDir, 'dB'), { recursive: true, force: true })
    await service.rebuildIndex(projectId)

    // O2 保简介：dA 的 description 与 updated_at 前后逐位相同（重建不清人工简介）
    const kept = domainRows(db, ws).find((r) => r.domain === 'dA')!
    expect(kept.description).toBe('人工简介资产')
    expect(kept.updated_at).toBe(at.updated_at)
    // O3 超集清除：dB（无条目无简介）行删；retired（有简介零条目）行保留；dD 行在场
    const final = domainRows(db, ws)
    expect(final.map((r) => r.domain)).toEqual(['dA', 'dD', 'retired'])
    expect(final.find((r) => r.domain === 'dD')?.description).toBeNull()
    // O4 终态收敛判定：全表行集 = 本库行集（无它库多余行、无残留行——期望集合相等）
    expect(rowKeys(domainRows(db))).toEqual(rowKeys(domainRows(db, ws)))
    db.close()
  })
})

// ── CT-domain-table-lifecycle-02 对账同事务（DL-E5） ──

describe('CT-domain-table-lifecycle-02 对账同事务原子性（DL-E5）', () => {
  it('O1 回滚完整（故障后行集与 v1 相等）；O2 半对账拒例；O3 重试收敛', () => {
    const w = makeWorld('ct02')
    const { db, ws, knowledgeDir } = w
    rebuildKnowledgeIndex(db)
    // v1 已知终态（dA/dB 各一行）+ 人工简介
    db.prepare(`UPDATE knowledge_domains SET description = 'keep', updated_at = ? WHERE ws_path = ? AND domain = 'dA'`).run(BASE_TS, ws)
    const v1 = rowKeys(domainRows(db))
    const v1Entries = db.prepare(`SELECT id, domain FROM knowledge_entries ORDER BY id`).all()

    // 变更待对账面：新域 dN 条目 + dB 条目归零
    put(knowledgeDir, 'dN', 'n1.md', 'dl-n1', 'confirmed')
    rmSync(join(knowledgeDir, 'dB'), { recursive: true, force: true })

    // 故障注入：域对账 INSERT 语句就绪时点抛（此刻事务内 entries/FTS 已重建——真中途失败）
    const original = db.prepare.bind(db) as (sql: string) => ReturnType<Database.Database['prepare']>
    const dbShim = db as unknown as { prepare: (sql: string) => ReturnType<Database.Database['prepare']> }
    let armed = true
    dbShim.prepare = (sql: string) => {
      if (armed && sql.includes('INSERT INTO knowledge_domains')) throw new Error('注入：域对账阶段失败')
      return original(sql)
    }
    expect(() => rebuildKnowledgeIndex(db)).toThrow(/注入/)
    armed = false
    dbShim.prepare = original

    // O1/O2：整体回滚——域表保持 v1；entries 投影同样回到 v1（无「entries 已重建而域表未对账」中间态）
    expect(rowKeys(domainRows(db))).toEqual(v1)
    expect(db.prepare(`SELECT id, domain FROM knowledge_entries ORDER BY id`).all()).toEqual(v1Entries)

    // O3：解除故障重跑 rebuild 达正常对账终态（失败不留永久损伤）
    rebuildKnowledgeIndex(db)
    expect(domainRows(db, ws).map((r) => r.domain)).toEqual(['dA', 'dN'])
    expect(domainRows(db, ws).find((r) => r.domain === 'dA')?.description).toBe('keep')
    db.close()
  })
})

// ── CT-domain-table-lifecycle-03 setDomainDescription：upsert 成功与纯空域创建（DL-G2/DL-E1） ──

describe('CT-domain-table-lifecycle-03 setDomainDescription upsert 与空域创建（DL-G2/E1）', () => {
  it('O1 既有域 upsert（读回 + updated_at 增新）；O2 纯空域创建（先域后条目正径 + count=0 隐去前置）；O3 幂等重写（主键幂等不重复）', async () => {
    const w = makeWorld('ct03')
    const { db, service, ws, projectId } = w
    await service.rebuildIndex(projectId)
    const q = (domain: string): DomainRow | undefined =>
      db.prepare<[string, string], DomainRow>(`SELECT ws_path, domain, description, updated_at FROM knowledge_domains WHERE ws_path = ? AND domain = ?`)
        .get(ws, domain)

    // O1 既有域 upsert
    await service.setDomainDescription({ wsPath: ws, domain: 'dA', description: '第一版简介' })
    const r1 = q('dA')!
    expect(r1.description).toBe('第一版简介')
    await new Promise((resolve) => setTimeout(resolve, 5))
    await service.setDomainDescription({ wsPath: ws, domain: 'dA', description: '第二版简介' })
    const r2 = q('dA')!
    expect(r2.description).toBe('第二版简介')
    expect(new Date(r2.updated_at).getTime()).toBeGreaterThan(new Date(r1.updated_at).getTime())

    // O2 纯空域创建：未 write 任何条目直接 set → 行创建（先域后条目正径；count=0 动态段隐去）
    await service.setDomainDescription({ wsPath: ws, domain: 'dE', description: '纯空域简介' })
    expect(q('dE')?.description).toBe('纯空域简介')
    const emptyCount = (db.prepare(`SELECT COUNT(*) AS n FROM knowledge_entries WHERE domain LIKE 'dE%'`).get() as { n: number }).n
    expect(emptyCount).toBe(0)

    // O3 幂等重写：同简介重复 set → 行不重复（主键幂等）、updated_at 刷新
    const dEWrittenAt = q('dE')!.updated_at
    await new Promise((resolve) => setTimeout(resolve, 5))
    await service.setDomainDescription({ wsPath: ws, domain: 'dE', description: '纯空域简介' })
    const rows = domainRows(db, ws).filter((r) => r.domain === 'dE')
    expect(rows).toHaveLength(1)
    expect(new Date(rows[0]!.updated_at).getTime()).toBeGreaterThan(new Date(dEWrittenAt).getTime())
    db.close()
  })
})

// ── CT-domain-table-lifecycle-04 setDomainDescription：校验拒例与埋点失败径（DL-E2/DL-E3） ──

describe('CT-domain-table-lifecycle-04 校验拒例与埋点两径（DL-E2/E3）', () => {
  it('O1 层数越界拒；O2 空值拒；O3 超长拒（500 恰合法边界对照正例）；O4 非法字符拒；O5 拒收零残留；O6 埋点成败两径可区分', async () => {
    const w = makeWorld('ct04')
    const { db, service, ws, events } = w
    await service.rebuildIndex(w.projectId)
    events.length = 0
    const before = rowKeys(domainRows(db))
    const BOUNDARY = 'a'.repeat(500)

    // O1 4 层越界
    await expect(service.setDomainDescription({ wsPath: ws, domain: 'a/b/c/d', description: 'x' })).rejects.toThrow(/超限/)
    // O2 空值
    await expect(service.setDomainDescription({ wsPath: ws, domain: '', description: 'x' })).rejects.toThrow(/空域路径/)
    // O3 超长（501 字符）拒 + 500 字符恰合法边界对照正例（边界内成功）
    await expect(service.setDomainDescription({ wsPath: ws, domain: 'a'.repeat(501), description: 'x' })).rejects.toThrow(/超长/)
    await expect(service.setDomainDescription({ wsPath: ws, domain: BOUNDARY, description: '边界正例' })).resolves.toBeUndefined()
    // O4 非法路径字符（反斜杠段形态）
    await expect(service.setDomainDescription({ wsPath: ws, domain: 'a\\b', description: 'x' })).rejects.toThrow(/段|非法/)

    // O5 拒收零残留：排除唯一合法边界行后，全表行集与前置快照相等（拒例零落行）
    expect(rowKeys(domainRows(db).filter((r) => r.domain !== BOUNDARY))).toEqual(before)
    expect(domainRows(db).some((r) => r.domain === 'a/b/c/d' || r.domain === 'a\\b')).toBe(false)

    // O6 埋点两径：成功例（边界正例 info）与失败例（四拒 warn）事件在场且可区分成败
    const info = events.filter((e) => e.event === 'knowledge-domain-update' && e.level === 'info')
    const warn = events.filter((e) => e.event === 'knowledge-domain-update' && e.level === 'warn')
    expect(info.length).toBeGreaterThanOrEqual(1)
    expect(warn).toHaveLength(4)
    for (const e of warn) expect(e.message).toMatch(/拒收/)
    db.close()
  })
})

// ── CT-domain-table-lifecycle-05 注销级联（DL-E4） ──

describe('CT-domain-table-lifecycle-05 注销级联（DL-E4）', () => {
  it('O1 级联删净（Wp 行集 = ∅）；O2 隔离（Wr 行集前后相等）；O3 孤儿拒例（零残留）', () => {
    const w = makeWorld('ct05')
    const { db, ws } = w
    const wsR = join(w.root, 'wsR')
    const dirR = join(wsR, '.knowledge')
    mkdirSync(join(dirR, 'rzone'), { recursive: true })
    put(dirR, 'rzone', 'r1.md', 'dl-r1', 'confirmed')
    const registry = createKnowledgeRegistry(db)
    registry.upsert(wsR, dirR, 'p-dl-R')
    rebuildKnowledgeIndex(db)
    const before = domainRows(db, wsR)
    expect(domainRows(db, ws).length).toBeGreaterThan(0)
    expect(before.length).toBeGreaterThan(0)

    // 注销 P（registry 行删除）
    expect(registry.remove(ws)).toBe(true)

    // O1：Wp 域行集 = ∅
    expect(domainRows(db, ws)).toEqual([])
    // O2：Wr 域行零波及
    expect(domainRows(db, wsR)).toEqual(before)
    // O3：孤儿拒例——全表无 ws_path=Wp 残留行
    expect(domainRows(db).some((r) => r.ws_path === ws)).toBe(false)
    db.close()
  })
})

// ── CT-domain-table-lifecycle-06 DDL v6 迁移与存量初始化（DL-E6） ──

describe('CT-domain-table-lifecycle-06 DDL v6 与存量初始化（DL-E6）', () => {
  it('O1 升级补行（v6 后首跑存量全域 NULL 行）；O2 迁移幂等（重复打开不报错不重复迁移）；O3 可逆（downgrade 后表缺席 + 版本回退）', () => {
    const w = makeWorld('ct06')
    const { db, ws } = w
    const versionOf = (d: Database.Database): number =>
      (d.prepare<unknown[], { v: number }>(`SELECT MAX(version) AS v FROM schema_meta`).get()?.v ?? 0)
    const hasTable = (d: Database.Database): boolean =>
      (d.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='knowledge_domains'`).get()?.n ?? 0) > 0

    // 前置：v6 就位（空库直开即 v6）
    expect(versionOf(db)).toBe(6)
    expect(hasTable(db)).toBe(true)
    // O1 存量初始化：v6 后首跑 rebuild，存量全域各得 NULL 行
    rebuildKnowledgeIndex(db)
    expect(domainRows(db, ws).map((r) => r.domain).sort()).toEqual(['dA', 'dB'])
    expect(domainRows(db, ws).every((r) => r.description === null)).toBe(true)

    // O3 可逆：downgrade v5 → 表缺席 + 版本回退
    downgradeKnowledgeSchema(db, 5)
    expect(hasTable(db)).toBe(false)
    expect(versionOf(db)).toBe(5)
    db.close()

    // O2 迁移幂等：重开同库 = 前向补迁 v6，不报错、单表不重复
    const db2 = openKnowledgeDatabase(join(w.root, 'knowledge', 'knowledge.db'))
    expect(versionOf(db2)).toBe(6)
    expect(hasTable(db2)).toBe(true)
    db2.close()
  })
})
