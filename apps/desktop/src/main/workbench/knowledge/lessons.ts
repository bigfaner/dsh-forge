// workbench/knowledge/lessons — `docs/lessons/*.md` 数据面(任务 2.2)。
//
// 移植基准 = forge-cli `pkg/infocmd/lesson.go` + infocmd.Discover 通用扫描
// (Go 权威):
//   - 布局:文档根 lessons/ 下平铺 *.md,条目名 = 文件名去 .md;
//   - frontmatter {created|date 回退, tags, title, severity}(severity 读入
//     不参与 CLI 呈现,透传保留);
//   - category 由文件名前缀推断(gotcha-/arch-/pattern-/tool-/lesson-/hook-);
//   - 排序:created 降序(字符串序,YYYY-MM-DD 词典序即时间序);单侧有
//     created 者在前;双侧缺失 → mtime 降级。
//
// filePath 口径:docBase 相对路径 `docs/lessons/<name>.md`(统一稳定标识;
// Go 返回绝对路径,跨进程边界一律折为相对 —— 布局一致,形态见模块头注)。
//
// 写腿(add,D4):frontmatter {created, tags, title?, severity?} + 正文;
// 名段校验 + 越界复核(knowledge-error 双闸);撞既有文件 → 不覆写。

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatterObject, readStringArrayField, readStringField, stringifyFrontmatter } from './frontmatter.ts'
import { assertInsideBase, assertRelativeSegment, assertSegment, KnowledgeDomainError } from './knowledge-error.ts'

export const LESSONS_DIR_NAME = 'lessons'

/** Go categoryPrefixes 同表(前缀 → 类目)。 */
const LESSON_CATEGORY_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['gotcha-', 'gotcha'],
  ['arch-', 'architecture'],
  ['pattern-', 'pattern'],
  ['tool-', 'tool'],
  ['lesson-', 'lesson'],
  ['hook-', 'hook'],
]

/** Go Lesson 同形(name/title/created/tags/category + filePath 相对口径)。 */
export interface Lesson {
  readonly name: string
  readonly title: string
  readonly created: string
  readonly tags: readonly string[]
  readonly severity: string
  readonly category: string
  readonly filePath: string
}

/** Go inferCategory:前缀命中即返回;无命中 → 空串。 */
export function inferLessonCategory(name: string): string {
  for (const [prefix, category] of LESSON_CATEGORY_PREFIXES) {
    if (name.startsWith(prefix)) return category
  }
  return ''
}

function parseLesson(name: string, content: string): Lesson | null {
  const fields = parseFrontmatterObject(content)
  if (fields === null) return null // frontmatter 损坏 → 跳过(Go ParseEntry err → skip)
  const created = readStringField(fields, 'created') || readStringField(fields, 'date')
  return {
    name,
    title: readStringField(fields, 'title'),
    created,
    tags: readStringArrayField(fields, 'tags'),
    severity: readStringField(fields, 'severity'),
    category: inferLessonCategory(name),
    filePath: join('docs', LESSONS_DIR_NAME, `${name}.md`),
  }
}

function mtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

/**
 * Go DiscoverLessons:目录缺失 → 空表非错误;仅收 *.md;排序 = created 降序
 * (单侧有 created 在前)→ mtime 降级。
 */
export function discoverLessons(docRoot: string): Lesson[] {
  const dir = join(docRoot, LESSONS_DIR_NAME)
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const items: Array<{ lesson: Lesson; mtime: number }> = []
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    const path = join(dir, name)
    let content: string
    try {
      content = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    const lesson = parseLesson(name.slice(0, -3), content)
    if (lesson === null) continue
    items.push({ lesson, mtime: mtimeMs(path) })
  }
  return items.sort((a, b) => {
    const ca = a.lesson.created
    const cb = b.lesson.created
    if (ca !== '' && cb !== '') return ca > cb ? -1 : ca < cb ? 1 : 0
    if (ca !== '') return -1
    if (cb !== '') return 1
    return b.mtime - a.mtime
  }).map(item => item.lesson)
}

/** Go FindLessonByName:未命中 → ERR_KNOWLEDGE_ENTRY_NOT_FOUND。 */
export function findLesson(docRoot: string, name: string): Lesson {
  const lesson = discoverLessons(docRoot).find(entry => entry.name === name)
  if (lesson === undefined) {
    throw new KnowledgeDomainError(
      'ERR_KNOWLEDGE_ENTRY_NOT_FOUND',
      `lesson not found: ${name}`,
      'Check the name is correct (without .md extension); list lessons first to see what exists',
    )
  }
  return lesson
}

/** add 入参draft(body 必填;created 缺省 = 当日 YYYY-MM-DD)。 */
export interface LessonDraft {
  readonly name: string
  readonly title?: string
  readonly tags?: readonly string[]
  readonly severity?: string
  readonly created?: string
  readonly body: string
}

/** add 写腿:段校验 → 越界复核 → 撞名拒绝 → mkdir lessons → 写文件。 */
export function writeLesson(docRoot: string, draft: LessonDraft): Lesson {
  assertSegment('lesson name', draft.name)
  assertRelativeSegment(draft.name, 'lesson name')
  const dir = join(docRoot, LESSONS_DIR_NAME)
  const target = assertInsideBase(dir, `${draft.name}.md`, 'lesson file')
  const fields: Record<string, unknown> = {
    created: draft.created ?? new Date().toISOString().slice(0, 10),
  }
  if (draft.tags !== undefined && draft.tags.length > 0) fields.tags = [...draft.tags]
  if (draft.title !== undefined && draft.title !== '') fields.title = draft.title
  if (draft.severity !== undefined && draft.severity !== '') fields.severity = draft.severity
  if (existsSync(target)) {
    throw new KnowledgeDomainError(
      'ERR_KNOWLEDGE_ENTRY_EXISTS',
      `lesson ${JSON.stringify(draft.name)} already exists at ${join('docs', LESSONS_DIR_NAME, `${draft.name}.md`)} (lessons are append-only; edit the file instead)`,
    )
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(target, stringifyFrontmatter(fields, draft.body), 'utf8')
  const written = parseLesson(draft.name, readFileSync(target, 'utf8'))
  return written ?? {
    name: draft.name,
    title: draft.title ?? '',
    created: draft.created ?? new Date().toISOString().slice(0, 10),
    tags: draft.tags ?? [],
    severity: draft.severity ?? '',
    category: inferLessonCategory(draft.name),
    filePath: join('docs', LESSONS_DIR_NAME, `${draft.name}.md`),
  }
}
