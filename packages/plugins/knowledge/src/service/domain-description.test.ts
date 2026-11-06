// stage③ C2 域简介写径 + 动态段计数口径单测（提案 §2.2）：setDomainDescription 校验
// 拒例（≤3 层/≤500/字符集——与 write 严契约共用 validateDomainPath）+ 埋点成败两径 +
// 顶域计数（file_path 前缀 registry 裁剪 + status 过滤 + 顶域 JS 截取 + 简介联查）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DiagEventPayload } from '@dsh-forge/contracts'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../storage/index.js'
import { createKnowledgeService } from './service.js'
import { domainTreeIndexOf, validateDomainPath } from './internal.js'
import type { BrowseKnowledgeService } from './types.js'

let home: string
let wsDir: string
let knowledgeDir: string
let service: BrowseKnowledgeService
let db: import('better-sqlite3').Database
const projectId = 'p-domain'
let diag: DiagEventPayload[] = []

function md(title: string, id: string, keywords: readonly string[], status: string, extra = ''): string {
  return `---\ntitle: ${title}\nid: ${id}\nstatus: ${status}\nsummary: s\nkeywords: [${keywords.join(', ')}]\n${extra}---\n正文`
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-domain-'))
  wsDir = join(home, 'ws')
  knowledgeDir = join(wsDir, '.knowledge')
  for (const d of ['alpha', 'alpha/sub', 'beta', 'other']) mkdirSync(join(knowledgeDir, d), { recursive: true })
  // alpha 2 条（1 confirmed + 1 unconfirmed 均计）+ alpha/sub 1 条（顶域 alpha 计数 3）
  writeFileSync(join(knowledgeDir, 'alpha', 'a1.md'), md('A1', 'dom-a1', ['k'], 'confirmed'), 'utf8')
  writeFileSync(join(knowledgeDir, 'alpha', 'a2.md'), md('A2', 'dom-a2', ['k'], 'unconfirmed'), 'utf8')
  writeFileSync(join(knowledgeDir, 'alpha', 'sub', 'a3.md'), md('A3', 'dom-a3', ['k'], 'confirmed'), 'utf8')
  // superseded 不计 + redirect（merged_into）不计
  writeFileSync(join(knowledgeDir, 'alpha', 'a4.md'), md('A4', 'dom-a4', ['k'], 'superseded', 'confirmed_at: 2026-01-01T00:00:00.000Z\n'), 'utf8')
  writeFileSync(join(knowledgeDir, 'beta', 'b1.md'), md('B1', 'dom-b1', ['k'], 'confirmed', 'merged_into: dom-a1\n'), 'utf8')
  writeFileSync(join(knowledgeDir, 'beta', 'b2.md'), md('B2', 'dom-b2', ['k'], 'confirmed'), 'utf8')
  // 根域文件（domain=''）不计顶域
  writeFileSync(join(knowledgeDir, 'root.md'), md('R', 'dom-root', ['k'], 'confirmed'), 'utf8')
  // 另一项目条目（file_path 前缀裁剪外）
  const ws2 = join(home, 'ws2')
  mkdirSync(join(ws2, '.knowledge', 'alpha'), { recursive: true })
  writeFileSync(join(ws2, '.knowledge', 'alpha', 'x.md'), md('X', 'dom-x', ['k'], 'confirmed'), 'utf8')
  db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  const registry = createKnowledgeRegistry(db)
  registry.upsert(wsDir, knowledgeDir, projectId)
  registry.upsert(ws2, join(ws2, '.knowledge'), 'p-other')
  service = createKnowledgeService({ db, resolveWsPath: (id) => (id === projectId ? wsDir : id === 'p-other' ? ws2 : undefined), emit: (p) => diag.push(p) })
})

afterAll(() => {
  db.close()
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

describe('validateDomainPath（write 严契约与 setDomainDescription 共用）', () => {
  it('合法域过；拒例逐条：空 / 超 3 层 / 超 500 / 点前导段 / 非法字符集', () => {
    expect(validateDomainPath('a')).toBeUndefined()
    expect(validateDomainPath('a/b')).toBeUndefined()
    expect(validateDomainPath('a/b/c')).toBeUndefined()
    expect(validateDomainPath('')).toMatch(/空域路径/)
    expect(validateDomainPath('a/b/c/d')).toMatch(/超限/)
    expect(validateDomainPath(`${'a'.repeat(501)}`)).toMatch(/超长/)
    expect(validateDomainPath('.hidden')).toMatch(/点前导/)
    expect(validateDomainPath('a/.b')).toMatch(/点前导/)
    expect(validateDomainPath('../escape')).toMatch(/点前导|非法相对路径/)
  })

  it('write 严契约同源消费：超 3 层域 → illegal-path 拒收（零落盘）', async () => {
    await service.rebuildIndex(projectId)
    const out = await service.write({
      projectId,
      title: 'Deep Domain Probe',
      summary: 's',
      keywords: ['deep-domain-probe'],
      body: 'b',
      domain: 'a/b/c/d',
      necessity: { stable: true, nonTrivial: true, value: true },
    })
    expect(out).toMatchObject({ outcome: 'rejected', reason: 'illegal-path' })
  })
})

describe('setDomainDescription（域简介写径——成败两径 knowledge-domain-update 埋点）', () => {
  it('成功径：upsert 落表 + 覆写更新 updated_at + info 埋点', async () => {
    diag = []
    await service.setDomainDescription({ wsPath: wsDir, domain: 'alpha', description: '声明性约束与惯例' })
    const row1 = db.prepare(`SELECT description, updated_at FROM knowledge_domains WHERE ws_path = ? AND domain = 'alpha'`).get(wsDir) as { description: string; updated_at: string }
    expect(row1.description).toBe('声明性约束与惯例')
    expect(row1.updated_at).toBeTruthy()
    await new Promise((r) => setTimeout(r, 5))
    await service.setDomainDescription({ wsPath: wsDir, domain: 'alpha', description: '更新后的简介' })
    const row2 = db.prepare(`SELECT description, updated_at FROM knowledge_domains WHERE ws_path = ? AND domain = 'alpha'`).get(wsDir) as { description: string; updated_at: string }
    expect(row2.description).toBe('更新后的简介')
    expect(new Date(row2.updated_at).getTime()).toBeGreaterThan(new Date(row1.updated_at).getTime())
    expect(diag.filter((d) => d.event === 'knowledge-domain-update' && d.level === 'info')).toHaveLength(2)
  })

  it('失败径：校验拒例（空简介/超 3 层/超 500）+ 未注册 wsPath → 抛 + warn 埋点 + 零落行', async () => {
    diag = []
    await expect(service.setDomainDescription({ wsPath: wsDir, domain: 'alpha', description: '  ' })).rejects.toThrow(/简介缺失/)
    await expect(service.setDomainDescription({ wsPath: wsDir, domain: 'a/b/c/d', description: 'x' })).rejects.toThrow(/超限/)
    await expect(service.setDomainDescription({ wsPath: wsDir, domain: 'x'.repeat(501), description: 'x' })).rejects.toThrow(/超长/)
    await expect(service.setDomainDescription({ wsPath: join(home, 'ws-unknown'), domain: 'alpha', description: 'x' })).rejects.toThrow(/未注册/)
    expect(diag.filter((d) => d.event === 'knowledge-domain-update' && d.level === 'warn')).toHaveLength(4)
    // 零落行：拒收域不落表
    const count = (db.prepare(`SELECT COUNT(*) c FROM knowledge_domains WHERE domain = 'a/b/c/d'`).get() as { c: number }).c
    expect(count).toBe(0)
  })
})

describe('write 扩参 domain_description（写事务内 upsert——三态回执 + 同现拒例）', () => {
  function writeQ(domain: string | undefined, description?: string) {
    return {
      projectId,
      title: `Domain Desc Probe ${Math.random().toString(36).slice(2, 8)}`,
      summary: 's',
      keywords: ['domain-desc-probe'],
      body: 'b',
      ...(domain !== undefined ? { domain } : {}),
      ...(description !== undefined ? { domainDescription: description } : {}),
      necessity: { stable: true, nonTrivial: true, value: true },
    } as const
  }
  const descRow = (domain: string): { description: string } | undefined =>
    db.prepare(`SELECT description FROM knowledge_domains WHERE ws_path = ? AND domain = ?`).get(wsDir, domain) as { description: string } | undefined

  it('created → unchanged → updated 三态幂等（upsert 落表 + 回执三态正确）', async () => {
    const r1 = await service.write(writeQ('other', '其他域：一次性验证素材'))
    expect(r1).toMatchObject({ outcome: 'written', domainDesc: 'created' })
    expect(descRow('other')?.description).toBe('其他域：一次性验证素材')
    const r2 = await service.write(writeQ('other', '其他域：一次性验证素材'))
    expect(r2).toMatchObject({ outcome: 'written', domainDesc: 'unchanged' })
    const r3 = await service.write(writeQ('other', '其他域：覆写后的简介'))
    expect(r3).toMatchObject({ outcome: 'written', domainDesc: 'updated' })
    expect(descRow('other')?.description).toBe('其他域：覆写后的简介')
  })

  it('拒例：无 domain（根域）携带 → illegal-description；空白简介拒收；域超 3 层仍 illegal-path', async () => {
    const noDomain = await service.write(writeQ(undefined, '根域简介'))
    expect(noDomain).toMatchObject({ outcome: 'rejected', reason: 'illegal-description', field: 'domain_description' })
    const blank = await service.write(writeQ('other', '   '))
    expect(blank).toMatchObject({ outcome: 'rejected', reason: 'illegal-description' })
    const deep = await service.write(writeQ('a/b/c/d', 'x'))
    expect(deep).toMatchObject({ outcome: 'rejected', reason: 'illegal-path' })
    // 拒收零落行：简介行仍为上一用例覆写值
    expect(descRow('other')?.description).toBe('其他域：覆写后的简介')
  })

  it('不带参回归：write 零变化——回执无 domainDesc 键，简介行不动', async () => {
    const before = (db.prepare(`SELECT COUNT(*) c FROM knowledge_domains`).get() as { c: number }).c
    const r = await service.write(writeQ('beta'))
    expect(r).toMatchObject({ outcome: 'written' })
    expect((r as { domainDesc?: string }).domainDesc).toBeUndefined()
    // 前序 rebuildIndex 已回填 beta NULL 简介行（row 在场 = bound 现口径）→ 无 HINT 行
    expect((r as { domainUnbound?: string }).domainUnbound).toBeUndefined()
    expect((db.prepare(`SELECT description FROM knowledge_domains WHERE ws_path = ? AND domain = 'beta'`).get(wsDir) as { description: string | null }).description).toBeNull()
    const after = (db.prepare(`SELECT COUNT(*) c FROM knowledge_domains`).get() as { c: number }).c
    expect(after).toBe(before)
  })
})

describe('domainTreeIndexOf（动态段域树计数口径——每调用期实时聚合）', () => {
  it('计数 = file_path 前缀裁剪 + confirmed/unconfirmed 计、superseded/redirect 不计 + 逐层前缀行 + 简介全路径联查', async () => {
    await service.setDomainDescription({ wsPath: wsDir, domain: 'alpha', description: '声明性约束与惯例' })
    const rows = domainTreeIndexOf(db, wsDir)
    // alpha = a1(confirmed) + a2(unconfirmed) + a3(alpha/sub) 计 3；alpha/sub 计 1；
    // a4 superseded 不计；beta = b2 计 1（b1 redirect 不计）；root 不计；ws2 的 alpha 裁剪外不计；
    // other = 扩参用例写入的 3 条 + 简介（写扩参 domain_description 落表联查可见）；
    // 输出序 = 深度升序、域路径升序（父先于子）
    expect(rows).toEqual([
      { domainPath: 'alpha', entryCount: 3, depth: 1, description: '声明性约束与惯例' },
      { domainPath: 'beta', entryCount: 2, depth: 1, description: null },
      { domainPath: 'other', entryCount: 3, depth: 1, description: '其他域：覆写后的简介' },
      { domainPath: 'alpha/sub', entryCount: 1, depth: 2, description: null },
    ])
    // 另一项目库：独立裁剪
    const other = domainTreeIndexOf(db, join(home, 'ws2'))
    expect(other).toEqual([{ domainPath: 'alpha', entryCount: 1, depth: 1, description: null }])
    // 未注册 ws → 空数组（动态段自然退场）
    expect(domainTreeIndexOf(db, join(home, 'ws-none'))).toEqual([])
  })
})
