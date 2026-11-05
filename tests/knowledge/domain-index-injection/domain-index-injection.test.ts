// @feature:knowledge
// Journey: domain-index-injection（proposal knowledge-stage3-retrieval §2.2 C2 / 裁决 #3/#9 / §7）。
// 溯源（断言-契约溯源，条目 id 注于每条断言）：
//   .forge/docs/proposals/knowledge-stage3-retrieval/testing/journey-domain-index-injection/contracts/contract.md
//   （CT-domain-index-injection-01..07 ← journey DI-G1..G5 / DI-E1..E7）。
// 策略与锚实锚说明：
// · 装配链在本 spec 走「真实服务面 + 真实 DB + 官方 scoped 注册缝的接线体
//   （registerKnowledgeScopedPrompt）+ 真实 text 闭包每 turn 求值」，仅 agent/created
//   事件与 systemPrompt 装配产物以事件注入桩承载（session-prompt 单测同构通道）。
// · 真机限定面（it.skip 留痕，归 test-run）：真实 Electron 宿主的 session-bind 两态
//   （G2/G3/G5 完整链）与最终系统提示词内两段相对 FILE_REFERENCE 的位次（E7 O1）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canonicalWsPath, createKnowledgeRegistry, openKnowledgeDatabase } from '../../../packages/plugins/knowledge/src/storage/index.js'
import { createKnowledgeService } from '../../../packages/plugins/knowledge/src/service/service.js'
import { topDomainIndexOf } from '../../../packages/plugins/knowledge/src/service/internal.js'
import { registerKnowledgeScopedPrompt } from '../../../packages/plugins/knowledge/src/service/session-prompt.js'
import {
  KNOWLEDGE_DOMAINS_SECTION_NAME,
  KNOWLEDGE_DOMAINS_SECTION_ORDER,
  KNOWLEDGE_SECTION_NAME,
  KNOWLEDGE_SECTION_ORDER,
  renderKnowledgeDomainsSection,
} from '../../../packages/plugins/knowledge/src/prompt/index.js'
import type { BrowseKnowledgeService } from '../../../packages/plugins/knowledge/src/service/types.js'
import type { KnowledgePromptSection, ScopedAgentFace } from '../../../packages/plugins/knowledge/src/tools/faces.js'

// ── 夹具：双注册库真实世界（P 多顶域混合状态 / R 独立顶域集） ──

const BASE_TS = '2026-01-01T00:00:00.000Z'
function ts(i: number): string {
  return new Date(Date.parse(BASE_TS) + i).toISOString()
}

function entryFile(o: { id: string; title?: string; status?: string; extra?: string }): string {
  return [
    '---',
    `id: ${o.id}`,
    `title: ${o.title ?? `T ${o.id}`}`,
    `status: ${o.status ?? 'unconfirmed'}`,
    'summary: s',
    'keywords: [k]',
    `version_ts: ${ts(o.id.length * 7 + o.id.charCodeAt(o.id.length - 1))}`,
    o.extra ?? '',
    '---',
    '',
    '正文。',
    '',
  ].join('\n')
}

function put(knowledgeDir: string, domain: string, file: string, id: string, o: { status?: string; extra?: string } = {}): void {
  const dir = join(knowledgeDir, ...domain.split('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), entryFile({ id, status: o.status, extra: o.extra }), 'utf8')
}

interface World {
  root: string
  wsP: string
  wsR: string
  db: import('better-sqlite3').Database
  service: BrowseKnowledgeService
  projectIdP: string
  projectIdR: string
}

let W: World

beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-j-di-'))
  const wsP = join(root, 'wsP')
  const wsR = join(root, 'wsR')
  const dirP = join(wsP, '.knowledge')
  const dirR = join(wsR, '.knowledge')
  mkdirSync(dirP, { recursive: true })
  mkdirSync(dirR, { recursive: true })
  // P：alpha 混合状态（confirmed×2 + unconfirmed×1 + superseded×1 + redirect×1 → 计 3 + 子域 1）
  put(dirP, 'alpha', 'a1.md', 'di-a1', { status: 'confirmed' })
  put(dirP, 'alpha', 'a2.md', 'di-a2')
  put(dirP, 'alpha', 'a3.md', 'di-a3', { status: 'confirmed' })
  put(dirP, 'alpha', 'a4.md', 'di-a4', { status: 'superseded', extra: 'confirmed_at: 2026-01-01T00:00:00.000Z' })
  put(dirP, 'alpha', 'a5.md', 'di-a5', { status: 'confirmed', extra: 'merged_into: di-a1' })
  put(dirP, 'alpha/sub', 'a6.md', 'di-a6', { status: 'confirmed' })
  // P：beta 纯净域（confirmed×2）
  put(dirP, 'beta', 'b1.md', 'di-b1', { status: 'confirmed' })
  put(dirP, 'beta', 'b2.md', 'di-b2', { status: 'confirmed' })
  // P：gamma（有简介域，1 条）
  put(dirP, 'gamma', 'g1.md', 'di-g1', { status: 'confirmed' })
  // P：delta（无简介域，1 条 → 降级行）
  put(dirP, 'delta', 'd1.md', 'di-d1', { status: 'confirmed' })
  // R：独立顶域集（与 P 零交集）
  put(dirR, 'rzone', 'r1.md', 'di-r1', { status: 'confirmed' })
  const db = openKnowledgeDatabase(join(root, 'knowledge', 'knowledge.db'))
  const registry = createKnowledgeRegistry(db)
  const projectIdP = 'p-di-P'
  const projectIdR = 'p-di-R'
  registry.upsert(wsP, dirP, projectIdP)
  registry.upsert(wsR, dirR, projectIdR)
  const service = createKnowledgeService({
    db,
    resolveWsPath: (id) => (id === projectIdP ? wsP : id === projectIdR ? wsR : undefined),
  })
  W = { root, wsP, wsR, db, service, projectIdP, projectIdR }
})

afterAll(() => {
  W.db.close()
  rmSync(W.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

/**
 * 官方缝接线体 + agent/created 事件注入（捕获该 agent scope 内注册的段集）。
 * 两级解析走真实注册表（cwd canonical → registry project_id → ws_path），
 * 动态注册的第三库（wsX/wsY 等）同径解析——非写死映射。
 */
function mountScoped() {
  const handlers: Array<(payload: { agent: ScopedAgentFace }) => unknown> = []
  const dispose = registerKnowledgeScopedPrompt({
    on: (_event, handler) => {
      handlers.push(handler)
      return () => undefined
    },
    resolveProjectId: (cwd) => createKnowledgeRegistry(W.db).findByWsPath(cwd)?.projectId ?? undefined,
    resolveWsPath: (projectId) => createKnowledgeRegistry(W.db).findByProjectId(projectId)?.wsPath,
    isRegistered: (wsPath) => createKnowledgeRegistry(W.db).findByWsPath(wsPath) !== undefined,
    topDomains: (wsPath) => topDomainIndexOf(W.db, wsPath),
  })
  const fire = (cwd: string | undefined): KnowledgePromptSection[] => {
    const sections: KnowledgePromptSection[] = []
    const agent = {
      session: { id: 's-1', ...(cwd === undefined ? {} : { header: { cwd } }) },
      ctx: { systemPrompt: { section: (s: KnowledgePromptSection) => (sections.push(s), () => undefined) } },
    }
    for (const h of handlers) h({ agent: agent as unknown as ScopedAgentFace })
    return sections
  }
  return { dispose, fire }
}

const dynamicOf = (sections: readonly KnowledgePromptSection[]): string => (sections[1]!.text as () => string)()
const staticOf = (sections: readonly KnowledgePromptSection[]): string => (sections[0]!.text as () => string)()

// ── CT-domain-index-injection-01 绑定注入两态（DI-G2/G3/DI-E5） ──

describe('CT-domain-index-injection-01 绑定注入两态（DI-G2/G3/E5）', () => {
  beforeAll(async () => {
    await W.service.rebuildIndex(W.projectIdP)
    await W.service.setDomainDescription({ wsPath: W.wsP, domain: 'alpha', description: '声明性约束与惯例' })
  })

  it('O1 绑定注入：cwd 命中绑定行且注册库在场 → 两段注册且标签正确（实时计数行在场）', () => {
    const r = mountScoped()
    const sections = r.fire(W.wsP)
    // DI-G2：静态段 + 动态段双在场
    expect(sections.map((s) => s.name)).toEqual([KNOWLEDGE_SECTION_NAME, KNOWLEDGE_DOMAINS_SECTION_NAME])
    expect(staticOf(sections)).toContain('<knowledge-base>')
    const dynamic = dynamicOf(sections)
    expect(dynamic).toContain('<knowledge-domains>')
    expect(dynamic).toContain('- alpha(4 entries) — 声明性约束与惯例') // alpha 顶域含 alpha/sub 子域计数
  })

  it('O2 未绑定退场：无绑定 cwd 会话零注册（两标签字符串均不出现）', () => {
    const r = mountScoped()
    expect(r.fire(join(W.root, 'elsewhere'))).toEqual([])
    expect(r.fire(undefined)).toEqual([])
  })

  it('O3 无库同生同退：注册库注销后（registry 行删除）两段 text 均空返（静态段以注册为前提）', async () => {
    const r = mountScoped()
    const wsX = join(W.root, 'wsX')
    const dirX = join(wsX, '.knowledge')
    mkdirSync(dirX, { recursive: true })
    put(dirX, 'tmpzone', 'x1.md', 'di-x1', { status: 'confirmed' })
    const registry = createKnowledgeRegistry(W.db)
    registry.upsert(wsX, dirX, 'p-di-X')
    await W.service.rebuildIndex(W.projectIdP)
    // 绑定 X（注册库在场）→ 注入
    const sectionsBound = r.fire(wsX)
    expect(sectionsBound).toHaveLength(2)
    expect(dynamicOf(sectionsBound)).toContain('- tmpzone(1 entry) — <无简介>')
    // 注销（registry 行删除 + 级联域行）→ 同生同退：已捕获段下一 turn 求值空返
    registry.remove(wsX)
    expect(staticOf(sectionsBound)).toBe('')
    expect(dynamicOf(sectionsBound)).toBe('')
  })

  it('O4 空标签拒例：任何求值结果不产生空 <knowledge-domains></knowledge-domains> 标签', () => {
    // 空清单 → 空串（段整体退场）；零计数域被过滤——两路均无空标签形态
    expect(renderKnowledgeDomainsSection([])).toBe('')
    expect(renderKnowledgeDomainsSection([{ domain: 'ghost', entryCount: 0, description: null }])).toBe('')
  })

  // 真机限定面留痕（归 test-run）：真实 Electron 宿主 session-bind 事件 → systemPrompt
  // scope 过滤装配产物两态（G2/G3/G5 完整链）。本 spec 的事件注入为回放层映射。
  it.skip('CT-domain-index-injection-01 真机面：Electron 宿主绑定/未绑定会话系统提示词两态实测（归 test-run）', () => {})
})

// ── CT-domain-index-injection-02 顶域行格式与计数（DI-G2/DI-E6） ──

describe('CT-domain-index-injection-02 顶域计数与行格式（DI-G2/E6）', () => {
  it('O1 状态口径：混合状态域计数 = confirmed+unconfirmed（superseded/redirect 不计）；O2 纯净域口径；O3 行格式可判', () => {
    const r = mountScoped()
    const dynamic = dynamicOf(r.fire(W.wsP))
    // O1：alpha = a1+a2+a3（confirmed×2 + unconfirmed×1）+ a6（alpha/sub 顶域截取）= 4；
    // a4 superseded 不计、a5 redirect（merged_into）不计
    expect(dynamic).toContain('- alpha(4 entries) — 声明性约束与惯例')
    // O2：beta = 全量 confirmed（2 条）
    expect(dynamic).toContain('- beta(2 entries) — <无简介>')
    // O3：每行匹配附录声明格式 `域名(N entries) — 简介`
    for (const line of dynamic.split('\n').filter((l) => l.startsWith('- '))) {
      expect(line).toMatch(/^- \S+\(\d+ entr(y|ies)\) — /)
    }
  })
})

// ── CT-domain-index-injection-03 简介缺席降级行（DI-E1/DI-G4） ──

describe('CT-domain-index-injection-03 降级行（DI-E1）', () => {
  it('O1 降级行在场（<无简介> 占位）；O2 降级行与简介行混排各归其域', () => {
    const r = mountScoped()
    const dynamic = dynamicOf(r.fire(W.wsP))
    // O1：delta 无简介 → 降级行（非空简介位、非缺席）
    expect(dynamic).toContain('- delta(1 entry) — <无简介>')
    // O2：同段内简介行（alpha）与降级行（beta/delta）并存
    expect(dynamic).toContain('- alpha(4 entries) — 声明性约束与惯例')
  })
})

// ── CT-domain-index-injection-04 截断 + 被截域名枚举（DI-E2） ──

describe('CT-domain-index-injection-04 截断与枚举（DI-E2）', () => {
  it('O3 负例先行：顶域 ≤10 时无截断行在场', () => {
    const stats = topDomainIndexOf(W.db, W.wsP)
    expect(stats.length).toBeLessThanOrEqual(10)
    expect(renderKnowledgeDomainsSection(stats)).not.toContain('more domains')
  })

  it('O1 恰 10 行截断；O2 N 字面与被截域名集合对账（= 顶域集 − 已列集）', async () => {
    // 构造至 12 顶域（现有 alpha/beta/gamma/delta + 追加 8 个 t 域）
    const dirP = join(W.wsP, '.knowledge')
    for (let i = 1; i <= 8; i += 1) put(dirP, `tzone${i}`, `t${i}.md`, `di-t${i}`, { status: 'confirmed' })
    await W.service.rebuildIndex(W.projectIdP)
    const stats = topDomainIndexOf(W.db, W.wsP)
    expect(stats).toHaveLength(12)
    const dynamic = renderKnowledgeDomainsSection(stats)
    const lines = dynamic.split('\n').filter((l) => l.startsWith('- '))
    // O1：11+ 顶域时恰 10 行
    expect(lines).toHaveLength(10)
    // O2：N 字面 = 12 − 10；被截域名集合 = 全集 − 已列集（消盲区对账）
    expect(dynamic).toContain('… and 2 more domains (search with domain_prefix)')
    const listed = new Set(lines.map((l) => /^- (\S+)\(/.exec(l)![1]))
    const all = new Set(stats.map((s) => s.domain))
    const truncated = [...all].filter((d) => !listed.has(d))
    expect(truncated).toHaveLength(2)
    for (const d of truncated) expect(d).toMatch(/^tzone\d+$/)
  })
})

// ── CT-domain-index-injection-05 域变化下一 turn 生效（DI-G4/DI-E3） ──

describe('CT-domain-index-injection-05 域变化下一 turn 生效（DI-G4/E3）', () => {
  it('O1 新域生效（降级行）；O2 既有域计数 +1；O3 未涉域行与 v1 逐位一致（零漂移）', async () => {
    const r = mountScoped()
    const sections = r.fire(W.wsR)
    const v1 = dynamicOf(sections).split('\n')
    // 变更：全新域 write 一条 + 既有域 rzone 追加一条（文件面 + rebuild 对账）——
    // R 库顶域 ≤10（无截断行干扰），v1/v2 全量行对照
    const dirR = join(W.wsR, '.knowledge')
    put(dirR, 'freshzone', 'n1.md', 'di-n1', { status: 'confirmed' })
    put(dirR, 'rzone', 'r2.md', 'di-r2', { status: 'confirmed' })
    await W.service.rebuildIndex(W.projectIdR)
    // 下一 turn：同一注册段 text 闭包实时求值（非注册时点冻结）
    const v2 = dynamicOf(sections).split('\n')
    // O1：新域降级行在场
    expect(v2).toContain('- freshzone(1 entry) — <无简介>')
    // O2：rzone 计数 1 → 2（实时聚合）
    expect(v2).toContain('- rzone(2 entries) — <无简介>')
    expect(v1).toContain('- rzone(1 entry) — <无简介>')
    // O3：未涉域行零漂移（v2 去掉 freshzone 行与 rzone 行后 = v1 去掉 rzone 行后）
    const strip = (lines: readonly string[], drop: readonly string[]): string[] =>
      lines.filter((l) => !drop.some((d) => l.startsWith(`- ${d}(`)))
    expect(strip(v2, ['freshzone', 'rzone'])).toEqual(strip(v1, ['rzone']))
  })
})

// ── CT-domain-index-injection-06 重绑切换与域隔离（DI-G5/DI-E4/INV-4） ──

describe('CT-domain-index-injection-06 重绑切换与域隔离（DI-G5/E4）', () => {
  it('O1 另一注册库会话动态段 = R 顶域集；O2 P 独有域名零残留；O3 空域隐去（表行保留与段隐去并存）', async () => {
    // 空域：简介在、条目归零（正径 = setDomainDescription 先域后条目）
    await W.service.setDomainDescription({ wsPath: W.wsP, domain: 'ghostzone', description: '有简介零条目域' })
    const r = mountScoped()
    // P 会话（对照组）：ghostzone 不出现在动态段（count=0 过滤）
    const pDynamic = dynamicOf(r.fire(W.wsP))
    expect(pDynamic).not.toContain('ghostzone')
    // 表行保留（与段隐去并存——契约③ E1 互证）
    const ghostRow = W.db
      .prepare(`SELECT description FROM knowledge_domains WHERE ws_path = ? AND domain = 'ghostzone'`)
      .get(canonicalWsPath(W.wsP)) as { description: string } | undefined
    expect(ghostRow?.description).toBe('有简介零条目域')
    // R 会话（重绑语义：新 agent 新 scope 捕获 R 的 ws_path 闭包）
    const rDynamic = dynamicOf(r.fire(W.wsR))
    // O1：段内域集 = R 顶域集（集合相等判定）
    const rListed = new Set([...rDynamic.matchAll(/^- (\S+)\(/gm)].map((m) => m[1]))
    expect(rListed).toEqual(new Set(topDomainIndexOf(W.db, W.wsR).map((s) => s.domain)))
    // O2：P 独有域名在 R 段出现即 FAIL（跨库零泄漏）
    expect(rDynamic).not.toContain('alpha')
    expect(rDynamic).not.toContain('beta')
    expect(rDynamic).not.toContain('gamma')
  })
})

// ── CT-domain-index-injection-07 装配位次与双段互指（DI-E7） ──

describe('CT-domain-index-injection-07 位次与互指（DI-E7）', () => {
  it('O2 互指成立：静态段指认串在场且动态段同名标签承接；两段 order 910/911 紧邻；O3 互斥负例（注销后双空）', () => {
    const r = mountScoped()
    const sections = r.fire(W.wsP)
    expect(sections[0]?.name).toBe(KNOWLEDGE_SECTION_NAME)
    expect(sections[1]?.name).toBe(KNOWLEDGE_DOMAINS_SECTION_NAME)
    expect(sections[0]?.order).toBe(KNOWLEDGE_SECTION_ORDER)
    expect(sections[1]?.order).toBe(KNOWLEDGE_DOMAINS_SECTION_ORDER)
    expect(KNOWLEDGE_SECTION_ORDER).toBe(910)
    expect(KNOWLEDGE_DOMAINS_SECTION_ORDER).toBe(911)
    expect(KNOWLEDGE_SECTION_ORDER).toBeLessThan(KNOWLEDGE_DOMAINS_SECTION_ORDER)
    // O2：静态段指认串 + 动态段同名标签（同一 turn 双段求值产物）
    expect(staticOf(sections)).toContain('listed in the')
    expect(staticOf(sections)).toContain('<knowledge-domains>')
    expect(dynamicOf(sections)).toContain('<knowledge-domains>')
    // O3 互斥负例（同生同退判定）：注册库注销后两段同空——不存在单段在场组合
    const registry = createKnowledgeRegistry(W.db)
    const wsY = join(W.root, 'wsY')
    mkdirSync(join(wsY, '.knowledge'), { recursive: true })
    registry.upsert(wsY, join(wsY, '.knowledge'), 'p-di-Y')
    const sectionsY = r.fire(wsY)
    expect(staticOf(sectionsY)).not.toBe('')
    registry.remove(wsY)
    expect(staticOf(sectionsY)).toBe('')
    expect(dynamicOf(sectionsY)).toBe('')
  })

  // 真机限定面留痕（归 test-run）：最终系统提示词内两段位于官方 FILE_REFERENCE 等既有段
  // 之后的相对位次（O1）——需真实宿主装配产物取证。
  it.skip('CT-domain-index-injection-07 O1 真机面：最终提示词内两段相对 FILE_REFERENCE 位次（归 test-run）', () => {})
})
