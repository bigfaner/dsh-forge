// workbench/knowledge/research — `docs/research/*.md` 数据面(任务 2.2)。
//
// 移植基准 = forge-cli `pkg/infocmd/research.go` + infocmd.Discover(Go 权威):
//   - 布局:文档根 research/ 下平铺 *.md,slug = 文件名去 .md;
//   - frontmatter {created, topic, mode, dimensions[], candidates[]};
//   - 「无有效 frontmatter」跳过(Go ParseEntry:topic 与 mode 均空 → error
//     → skip —— 空壳/白板文件不进清单);
//   - 排序:created 降序 → mtime 降级(lesson 同律);
//   - filePath 口径:docBase 相对 `docs/research/<slug>.md`(见 lessons.ts 头注)。
//
// 写腿(add,D4):frontmatter {created, topic, mode, dimensions?, candidates?}
// + 正文;段校验 + 越界复核;撞既有 → 不覆写。

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatterObject, readStringArrayField, readStringField, stringifyFrontmatter } from './frontmatter.ts'
import { assertInsideBase, assertRelativeSegment, assertSegment, KnowledgeDomainError } from './knowledge-error.ts'

export const RESEARCH_DIR_NAME = 'research'

/** Go Report 同形。 */
export interface ResearchReport {
  readonly slug: string
  readonly created: string
  readonly topic: string
  readonly mode: string
  readonly dimensions: readonly string[]
  readonly candidates: readonly string[]
  readonly filePath: string
}

function parseReport(slug: string, content: string): ResearchReport | null {
  const fields = parseFrontmatterObject(content)
  if (fields === null) return null
  const topic = readStringField(fields, 'topic')
  const mode = readStringField(fields, 'mode')
  if (topic === '' && mode === '') return null // Go "no topic or mode" skip
  return {
    slug,
    created: readStringField(fields, 'created'),
    topic,
    mode,
    dimensions: readStringArrayField(fields, 'dimensions'),
    candidates: readStringArrayField(fields, 'candidates'),
    filePath: join('docs', RESEARCH_DIR_NAME, `${slug}.md`),
  }
}

function mtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

/** Go DiscoverReports:目录缺失 → 空表;created 降序 → mtime 降级。 */
export function discoverReports(docRoot: string): ResearchReport[] {
  const dir = join(docRoot, RESEARCH_DIR_NAME)
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const items: Array<{ report: ResearchReport; mtime: number }> = []
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    const path = join(dir, name)
    let content: string
    try {
      content = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    const report = parseReport(name.slice(0, -3), content)
    if (report === null) continue
    items.push({ report, mtime: mtimeMs(path) })
  }
  return items.sort((a, b) => {
    const ca = a.report.created
    const cb = b.report.created
    if (ca !== '' && cb !== '') return ca > cb ? -1 : ca < cb ? 1 : 0
    if (ca !== '') return -1
    if (cb !== '') return 1
    return b.mtime - a.mtime
  }).map(item => item.report)
}

/** Go FindReportBySlug:未命中 → ERR_KNOWLEDGE_ENTRY_NOT_FOUND。 */
export function findReport(docRoot: string, slug: string): ResearchReport {
  const report = discoverReports(docRoot).find(entry => entry.slug === slug)
  if (report === undefined) {
    throw new KnowledgeDomainError(
      'ERR_KNOWLEDGE_ENTRY_NOT_FOUND',
      `research report not found: ${slug}`,
      'Check the slug is correct (without .md extension); list research first to see what exists',
    )
  }
  return report
}

/** add 入参 draft(body 必填;created 缺省 = 当日)。 */
export interface ResearchDraft {
  readonly slug: string
  readonly topic?: string
  readonly mode?: string
  readonly dimensions?: readonly string[]
  readonly candidates?: readonly string[]
  readonly created?: string
  readonly body: string
}

/** add 写腿:段校验 → 越界复核 → 撞名拒绝 → mkdir research → 写文件。 */
export function writeReport(docRoot: string, draft: ResearchDraft): ResearchReport {
  assertSegment('research slug', draft.slug)
  assertRelativeSegment(draft.slug, 'research slug')
  const dir = join(docRoot, RESEARCH_DIR_NAME)
  const target = assertInsideBase(dir, `${draft.slug}.md`, 'research file')
  if (existsSync(target)) {
    throw new KnowledgeDomainError(
      'ERR_KNOWLEDGE_ENTRY_EXISTS',
      `research report ${JSON.stringify(draft.slug)} already exists at ${join('docs', RESEARCH_DIR_NAME, `${draft.slug}.md`)} (reports are append-only; edit the file instead)`,
    )
  }
  const fields: Record<string, unknown> = {
    created: draft.created ?? new Date().toISOString().slice(0, 10),
    topic: draft.topic ?? '',
    mode: draft.mode ?? '',
  }
  if (draft.dimensions !== undefined && draft.dimensions.length > 0) fields.dimensions = [...draft.dimensions]
  if (draft.candidates !== undefined && draft.candidates.length > 0) fields.candidates = [...draft.candidates]
  mkdirSync(dir, { recursive: true })
  writeFileSync(target, stringifyFrontmatter(fields, draft.body), 'utf8')
  const written = parseReport(draft.slug, readFileSync(target, 'utf8'))
  if (written !== null) return written
  return {
    slug: draft.slug,
    created: draft.created ?? new Date().toISOString().slice(0, 10),
    topic: draft.topic ?? '',
    mode: draft.mode ?? '',
    dimensions: draft.dimensions ?? [],
    candidates: draft.candidates ?? [],
    filePath: join('docs', RESEARCH_DIR_NAME, `${draft.slug}.md`),
  }
}
