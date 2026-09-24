// workbench/indexer/parse-feature — forge feature 方言解析(任务 2.5)。
//
// 方言钉定(本仓 live 结构):docs/features/ 下一级子目录,含 manifest.md
// 即为 feature 目录(无 manifest.md 的目录不是 forge feature,静默忽略);
// manifest.md frontmatter `status` = 词表 prd/design/tasks/in-progress/
// completed 原词透传(schema 无 CHECK,本层仅做词表校验拒绝越界 —— 不枚举
// 改写,Hard Rule);五类文档存在性按钉定锚点探测:
//
//   manifest → manifest.md          prd → prd/prd-spec.md
//   design  → design/tech-design.md ui  → ui/ui-design.md
//   tasks   → tasks/index.json
//
// 降级纪律(AC4,与 parse-task 对齐):manifest 损坏 → feature 行不写不改
// (保留既有),任务集照常解析;tasks/index.json 损坏 → tasks = null,调用
// 方保留该 feature 既有任务行,不做结构性删除。

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DocKind, FeatureStatus } from '../repos/types.ts'
import {
  parseFeatureTasks,
  parseFrontmatter,
  readTaskIndex,
  type ForgeParseFailure,
  type ParsedTask,
} from './parse-task.ts'

/** manifest status 词表(feature_snapshot 透传词表)。 */
const FEATURE_STATUS_VOCAB: ReadonlySet<string> = new Set(['prd', 'design', 'tasks', 'in-progress', 'completed'])

/**
 * 五类文档的方言锚点(相对 feature 目录)。任务 2.7 起导出:readFeatureDoc
 * 动词的文件定位与 docKinds 探测共用同一锚点表(单一事实源)。
 */
export const DOC_KIND_ANCHORS: ReadonlyArray<readonly [DocKind, string]> = [
  ['manifest', join('manifest.md')],
  ['prd', join('prd', 'prd-spec.md')],
  ['design', join('design', 'tech-design.md')],
  ['ui', join('ui', 'ui-design.md')],
  ['tasks', join('tasks', 'index.json')],
]

/** 单 feature 解析产物。 */
export interface ParsedFeature {
  readonly slug: string
  /** manifest 可读且 status 在词表内。false = feature 行不写不改。 */
  readonly manifestOk: boolean
  readonly status: FeatureStatus | null
  readonly docKinds: DocKind[]
  /** null = index.json 不可读 → 该 feature 任务行保留不动。 */
  readonly tasks: ParsedTask[] | null
  /** manifest.md 与 tasks/index.json 的 mtime 最大值(ISO)。 */
  readonly updatedAt: string
}

export interface FeatureScanResult {
  readonly features: ParsedFeature[]
  readonly failures: ForgeParseFailure[]
}

function exists(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function mtimeIsoOrNull(path: string): string | null {
  try {
    return statSync(path).mtime.toISOString()
  } catch {
    return null
  }
}

/** 解析单个 feature 目录的产物:feature 主体 + 该目录累积的失败项。 */
interface FeatureDirParse {
  readonly feature: ParsedFeature
  readonly failures: ForgeParseFailure[]
}

/** 解析单个 feature 目录(manifest 损坏仍尝试任务集;两者独立降级)。 */
function parseFeatureDir(featureDir: string, slug: string): FeatureDirParse {
  const failures: ForgeParseFailure[] = []
  const manifestPath = join(featureDir, 'manifest.md')
  let manifestOk = false
  let status: FeatureStatus | null = null
  let manifestMtime: string | null = null
  try {
    const manifestMarkdown = readFileSync(manifestPath, 'utf8')
    manifestMtime = mtimeIsoOrNull(manifestPath)
    const frontmatter = parseFrontmatter(manifestMarkdown)
    const rawStatus = frontmatter?.status
    if (frontmatter === null || rawStatus === undefined || rawStatus === '') {
      failures.push({ file: `${slug}/manifest.md`, reason: 'manifest frontmatter missing or has no status' })
    } else if (!FEATURE_STATUS_VOCAB.has(rawStatus)) {
      failures.push({ file: `${slug}/manifest.md`, reason: `manifest status ${rawStatus} outside vocabulary` })
    } else {
      manifestOk = true
      status = rawStatus as FeatureStatus
    }
  } catch {
    failures.push({ file: `${slug}/manifest.md`, reason: 'manifest.md unreadable' })
  }

  const tasksDir = join(featureDir, 'tasks')
  const indexPath = join(tasksDir, 'index.json')
  let tasks: ParsedTask[] | null = null
  const entries = readTaskIndex(indexPath)
  if (entries === null) {
    // M3 任务 6.7:缺失与损坏分型 —— 缺失(文件不在)是已迁移项目的
    // 稳态(index.json 已淘汰,.migrated-* 归档;权威在 SQLite),扫描层
    // 按 data_authority 过滤该形态;在场而不可解析仍为失败(外部异常)。
    failures.push({
      file: `${slug}/tasks/index.json`,
      reason: exists(indexPath) ? 'tasks index unreadable or malformed' : 'tasks index missing',
    })
  } else {
    const taskResult = parseFeatureTasks(tasksDir, slug, entries, mtimeIsoOrNull(indexPath) ?? '')
    tasks = taskResult.tasks
    failures.push(...taskResult.failures)
  }

  const docKinds = DOC_KIND_ANCHORS.flatMap(([kind, anchor]) => (exists(join(featureDir, anchor)) ? [kind] : []))
  const indexMtime = mtimeIsoOrNull(indexPath) ?? ''
  const updatedAt = [manifestMtime ?? '', indexMtime].reduce((a, b) => (b > a ? b : a), '')

  return { feature: { slug, manifestOk, status, docKinds, tasks, updatedAt }, failures }
}

/**
 * 扫描 features 目录:一级子目录逐个判定(含 manifest.md = feature)。
 * 目录本身不可读 → 空结果 + 失败项(调用方据此整体保形,不清快照)。
 */
export function scanFeatures(featuresDir: string): FeatureScanResult {
  let dirents: Iterable<string>
  try {
    dirents = readdirSync(featuresDir)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { features: [], failures: [{ file: featuresDir, reason: `features directory unreadable: ${reason}` }] }
  }
  const features: ParsedFeature[] = []
  const failures: ForgeParseFailure[] = []
  for (const name of dirents) {
    const featureDir = join(featuresDir, name)
    try {
      if (!statSync(featureDir).isDirectory()) continue
    } catch {
      continue
    }
    if (!exists(join(featureDir, 'manifest.md'))) continue // 非 feature 目录:静默忽略
    const parsed = parseFeatureDir(featureDir, name)
    features.push(parsed.feature)
    failures.push(...parsed.failures)
  }
  features.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
  return { features, failures }
}
