// stage③ C1 search FTS5 三因子单测（提案 §2.1 裁决 #2/#10）：排序区分性（新归一
// bm25Norm 非平顶）/ rank 因子微调 / 热度不挤出相关新条目（位次对照断言锚行为非分值）/
// CJK 子串补充准入通道 / 零命中空回执（服务面）。
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKnowledgeRegistry, openKnowledgeDatabase } from '../storage/index.js'
import { createKnowledgeService } from './service.js'
import { bm25Norm, composeSearchScore, heatBonusOf, rankFactorOf } from './internal.js'
import type { BrowseKnowledgeService } from './types.js'

let home: string
let wsDir: string
let knowledgeDir: string
let service: BrowseKnowledgeService
let db: import('better-sqlite3').Database
const projectId = 'p-bm25'

function md(title: string, id: string, keywords: readonly string[], summary: string, status = 'unconfirmed'): string {
  return `---\ntitle: ${title}\nid: ${id}\nstatus: ${status}\nsummary: ${summary}\nkeywords: [${keywords.join(', ')}]\n---\n正文`
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-forge-kn-bm25-'))
  wsDir = join(home, 'ws')
  knowledgeDir = join(wsDir, '.knowledge')
  mkdirSync(join(knowledgeDir, 'gw'), { recursive: true })
  mkdirSync(join(knowledgeDir, 'misc'), { recursive: true })
  // 相关行（词频高：目标词元在 title/keywords/summary 多处出现）vs 不相关行（仅 keywords 命中）
  writeFileSync(join(knowledgeDir, 'gw', 'a.md'), md('bm25test bm25test', 'bm25-a', ['bm25test'], 'bm25test bm25test bm25test', 'confirmed'), 'utf8')
  writeFileSync(join(knowledgeDir, 'misc', 'b.md'), md('Unrelated Note', 'bm25-b', ['bm25test'], 'lorem ipsum dolor sit amet unrelated words', 'confirmed'), 'utf8')
  // rank 因子对照行：与 a 完全同文本、不同档（unconfirmed 0.6 → 因子 0.92）
  writeFileSync(join(knowledgeDir, 'gw', 'c.md'), md('Gateway Alpha bm25', 'bm25-c', ['bm25test'], 'alpha gateway routing bm25test token alpha alpha bm25test'), 'utf8')
  // 热度对照：高频旧条目（仅 keywords 命中、低相关、长文档）vs 相关新条目（短文档高频词、heat=0）
  writeFileSync(join(knowledgeDir, 'misc', 'hot.md'), md('Hot Old Note', 'bm25-hot', ['bm25test'], 'legacy misc old words only filler filler filler padding padding unrelated legacy misc old words only filler filler filler padding padding unrelated', 'confirmed'), 'utf8')
  // CJK 子串通道行：summary 内「原子幂等」嵌于更长连续 run（unicode61 单 token，FTS 词元不命中）
  writeFileSync(join(knowledgeDir, 'gw', 'cjk.md'), md('装配守卫', 'bm25-cjk', ['guard'], '装配必须原子幂等性保证防复发', 'confirmed'), 'utf8')
  // CJK 单 token 语义行：title「部署规范」为单个 unicode61 token——query「部署」FTS 词元不命中，须经 JS 词元通道准入
  writeFileSync(join(knowledgeDir, 'gw', 'cjk2.md'), md('部署规范', 'bm25-cjk2', ['deploy'], '知识检索词面通道部署说明', 'confirmed'), 'utf8')
  // 背景填充行（不含 bm25test——FTS5 idf 对「词面命中过半文档」钳到 ε 使 bm25 平顶，须占少数）
  mkdirSync(join(knowledgeDir, 'filler'), { recursive: true })
  for (let i = 0; i < 16; i += 1) {
    writeFileSync(join(knowledgeDir, 'filler', `f${i}.md`), md(`Filler ${i}`, `bm25-f${i}`, [`filler${i}`], `filler corpus filler${i} unrelated words`, 'confirmed'), 'utf8')
  }
  db = openKnowledgeDatabase(join(home, 'knowledge.db'))
  createKnowledgeRegistry(db).upsert(wsDir, knowledgeDir, projectId)
  service = createKnowledgeService({ db, resolveWsPath: (id) => (id === projectId ? wsDir : undefined) })
})

afterAll(() => {
  db.close()
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

describe('归一与三因子纯函数（裁决 #10——不复用平顶 ftsRankOf）', () => {
  it('bm25Norm：越相关（越负）值越大且命中行间有区分（非平顶、方向随相关单调升）', () => {
    expect(bm25Norm(0)).toBeCloseTo(0)
    expect(bm25Norm(-1)).toBe(0.5)
    expect(bm25Norm(-3)).toBe(0.75)
    expect(bm25Norm(-3)).toBeGreaterThan(bm25Norm(-1))
  })

  it('rank 因子四档微调（1.0→1.0 / 0.6→0.92 / 0.4→0.88 / 0.2→0.84）+ 热度轻加分', () => {
    expect(rankFactorOf(1.0)).toBeCloseTo(1.0)
    expect(rankFactorOf(0.6)).toBeCloseTo(0.92)
    expect(rankFactorOf(0.4)).toBeCloseTo(0.88)
    expect(rankFactorOf(0.2)).toBeCloseTo(0.84)
    expect(heatBonusOf(0)).toBe(0)
    expect(heatBonusOf(1000)).toBeLessThanOrEqual(0.35) // log 封顶——热度不翻盘
  })

  it('composeSearchScore：bm25 缺位（子串通道/无过滤）→ norm 中性 0.5', () => {
    expect(composeSearchScore({ effectiveRank: 1.0, heat: 0 })).toBe(0.5)
    expect(composeSearchScore({ bm25: -1, effectiveRank: 1.0, heat: 0 })).toBeCloseTo(0.5)
  })
})

describe('search BM25 排序（断言锚位次行为，非分值字面）', () => {
  it('rebuild 后基线：词条命中集不缩水', async () => {
    const r = await service.rebuildIndex(projectId)
    expect(r.indexed).toBe(22)
  })

  it('排序区分性：相关条目（高 bm25）居前，不相关条目（仅 keywords 命中）居后', async () => {
    const hits = await service.search({ projectId, text: 'bm25test', sessionId: 's' })
    expect(hits.map((h) => h.frontmatterId)).toContain('bm25-a')
    expect(hits.map((h) => h.frontmatterId)).toContain('bm25-b')
    const posOf = (id: string): number => hits.findIndex((h) => h.frontmatterId === id)
    expect(posOf('bm25-a')).toBeGreaterThan(-1)
    expect(posOf('bm25-a')).toBeLessThan(posOf('bm25-b'))
    // 分值区分性（同查询命中行分值不全等——非平顶）
    const distinctScores = new Set(hits.filter((h) => h.frontmatterId === 'bm25-a' || h.frontmatterId === 'bm25-b').map((h) => h.score))
    expect(distinctScores.size).toBe(2)
  })

  it('rank 因子微调：同文本同 bm25，confirmed（1.0）居 unconfirmed（0.92）前', async () => {
    const hits = await service.search({ projectId, text: 'bm25test', sessionId: 's' })
    const posOf = (id: string): number => hits.findIndex((h) => h.frontmatterId === id)
    expect(posOf('bm25-a')).toBeLessThan(posOf('bm25-c'))
    const a = hits.find((h) => h.frontmatterId === 'bm25-a')!
    const c = hits.find((h) => h.frontmatterId === 'bm25-c')!
    expect(a.effectiveRank).toBe(1.0)
    expect(c.effectiveRank).toBe(0.6)
  })

  it('热度不挤出：相关新条目（heat 0）位次居高频旧条目（heat 50 低相关）前', async () => {
    // 人为堆热：recall_logs 直插 50 行（热度面同源单表计数；0.05×log(1+50)≈0.20 微权）
    const hot = db.prepare(`SELECT rowid FROM knowledge_entries WHERE id = 'bm25-hot'`).get() as { rowid: number }
    const ins = db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, hit_count, created_at)
       VALUES (?, ?, ?, 'search', ?, 1, ?)`,
    )
    for (let i = 0; i < 50; i += 1) ins.run(projectId, `heat-${i}`, 'heat', hot.rowid, new Date().toISOString())
    const hits = await service.search({ projectId, text: 'bm25test', sessionId: 's' })
    const posOf = (id: string): number => hits.findIndex((h) => h.frontmatterId === id)
    expect(posOf('bm25-a')).toBeLessThan(posOf('bm25-hot'))
  })

  it('CJK 子串补充准入通道：「原子幂等」嵌于连续 run（FTS 词元不命中）仍可检得', async () => {
    const hits = await service.search({ projectId, text: '原子幂等', sessionId: 's' })
    expect(hits.map((h) => h.frontmatterId)).toContain('bm25-cjk')
  })

  it('CJK 单 token 语义：「部署」命中 title「部署规范」（unicode61 单 token，FTS 词元不命中 → JS 词元通道）', async () => {
    const hits = await service.search({ projectId, text: '部署', sessionId: 's' })
    expect(hits.map((h) => h.frontmatterId)).toContain('bm25-cjk2')
  })

  it('CJK 多词 query：「部署 规范」空格分词命中「部署规范」行（整串子串兜底不覆盖的多词缺口）', async () => {
    const hits = await service.search({ projectId, text: '部署 规范', sessionId: 's' })
    expect(hits.map((h) => h.frontmatterId)).toContain('bm25-cjk2')
  })

  it('CJK 自然语言连打长 run query：「部署规范」（无空格 run）bigram 词元命中同行', async () => {
    const hits = await service.search({ projectId, text: '部署规范', sessionId: 's' })
    expect(hits.map((h) => h.frontmatterId)).toContain('bm25-cjk2')
  })

  it('OR 容错通路：部分词元命中即候选（「部署执行审计」的部署词元命中「部署规范」行——AND 零命中缺口收口）', async () => {
    const hits = await service.search({ projectId, text: '部署执行审计', sessionId: 's' })
    expect(hits.map((h) => h.frontmatterId)).toContain('bm25-cjk2')
  })

  // bug db58e1c4（家族 4cf01aa9）根因修复 pin：子串准入通道词元 AND → OR 容错并集——
  // 任一词元命中（FTS 全列强证据 ∪ title/summary 子串）即候选，中性层按词元覆盖度
  // 细分排序保相关性；FTS AND 词面证据层维持（强证据不被弱候选挤出）。
  it('OR 容错：多词 query 含 title/summary 外词元——「部署 deploy」仍命中（AND 判定域缺口收口）', async () => {
    const hits = await service.search({ projectId, text: '部署 deploy', sessionId: 's' })
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits.map((h) => h.frontmatterId)).toContain('bm25-cjk2')
  })

  it('OR 容错：多词 query 词元仅存在于 keywords 列——「部署 上线 发布 检查清单」≥1 命中', async () => {
    const hits = await service.search({ projectId, text: '部署 上线 发布 检查清单', sessionId: 's' })
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits.map((h) => h.frontmatterId)).toContain('bm25-cjk2')
  })

  it('单 CJK token 子串通道维持：「部署」单 token 命中 title「部署规范」', async () => {
    const hits = await service.search({ projectId, text: '部署', sessionId: 's' })
    expect(hits.map((h) => h.frontmatterId)).toContain('bm25-cjk2')
  })

  it('零命中诚实回执维持：OR 容错下全词元不命中仍返回 []（无兜底注入）', async () => {
    const zero = await service.search({ projectId, text: 'zzqx q7wv', sessionId: 's' })
    expect(zero).toEqual([])
  })

  it('域前缀过滤原样 + 零命中空回执（[]，无兜底注入）', async () => {
    const gw = await service.search({ projectId, domainPrefix: 'gw', text: 'bm25test', sessionId: 's' })
    expect(gw.map((h) => h.frontmatterId).sort()).toEqual(['bm25-a', 'bm25-c'])
    const zero = await service.search({ projectId, text: 'nosuchkw', sessionId: 's' })
    expect(zero).toEqual([])
    // 无过滤全域查询：全条目中性分返回（不炸、不缩水）
    const all = await service.search({ projectId, sessionId: 's' })
    expect(all).toHaveLength(22)
  })

  it('判例 d24a4464 保持：解析每调用期求值（新注册目录次查询即见）；keywords 退役 pin——text-only 词面照常命中 keywords 列', async () => {
    const ws2 = join(home, 'ws2')
    const dir2 = join(ws2, '.knowledge', 'fresh')
    mkdirSync(dir2, { recursive: true })
    // freshkw 仅存在于条目 keywords 资产（title/summary/正文均无）——text-only 词面
    // 经 buildSearchFtsMatch 全列 MATCH 照常命中 keywords 列（SC-9 单测 pin）
    writeFileSync(join(dir2, 'n.md'), md('Fresh Entry', 'bm25-fresh', ['freshkw'], 'fresh words', 'confirmed'), 'utf8')
    createKnowledgeRegistry(db).upsert(ws2, join(ws2, '.knowledge'), 'p2')
    await service.rebuildIndex(projectId)
    const svc2 = createKnowledgeService({ db, resolveWsPath: (id) => (id === 'p2' ? ws2 : undefined) })
    const hits = await svc2.search({ projectId: 'p2', text: 'freshkw', sessionId: 's' })
    expect(hits.map((h) => h.frontmatterId)).toEqual(['bm25-fresh'])
    expect(existsSync(join(dir2, 'n.md'))).toBe(true)
  })
})
