// workbench/stages/stage-asset-index — stage_asset 感知索引(任务 3.2)。
//
// stage_asset 表(schema-v2.sql §7)= 阶段资产派生索引:(project_id,
// feature_slug, stage) PK + path + generated_at;内容留文档根
// `features/<slug>/stages/<stage>.md`(frontmatter { stage, generated, goal }
// + 正文摘要,由 agent 会话经 forge.stage.summarize 写入,tech-design
// §Interface 5)。TECH-data-kernel-001:快照/索引类表派生可重建,不承载
// 权威语义 —— 本模块是 stage_asset 的唯一写入口,行集 = stages/ 目录的
// 纯函数(清空重建零差异;感知扫描路径与重建路径共用同一同步实现)。
//
// 防御纪律(indexer 先例):frontmatter 缺失 / stage 越界词表 / YAML 损坏
// → 该文件跳过(不炸扫描);同 stage 多文件时取文件名字典序首位(确定性,
// 不依赖 readdir 顺序)。generated 非字符串 → null(不虚构时间)。

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FeatureStatus, RepoDb } from '../repos/types.ts'
import { parseFrontmatterObject, readStringField } from '../knowledge/frontmatter.ts'
import type { StageAssetRow } from '../ipc/types.ts'

/**
 * forge 阶段词表与管线序(schema-v2 stage CHECK 同源;feature_snapshot
 * status 透传词表)。「各阶段资产齐全」的聚合面与读取排序共用此序。
 */
export const STAGE_PIPELINE: readonly FeatureStatus[] = ['prd', 'design', 'tasks', 'in-progress', 'completed']

const STAGE_VOCAB: ReadonlySet<string> = new Set(STAGE_PIPELINE)

/** 词表守卫(stage_asset.stage CHECK 同源)。 */
export function isStageValue(value: string): value is FeatureStatus {
  return STAGE_VOCAB.has(value)
}

/** 资产文件相对路径(features 根方言,与 task.desc_path 同基准)。 */
export function stageAssetPathOf(featureSlug: string, stage: FeatureStatus): string {
  return `${featureSlug}/stages/${stage}.md`
}

/**
 * 解析单份阶段资产 md:frontmatter { stage, generated, goal }。不可索引
 * (无 frontmatter / stage 缺失或越界)→ null —— 调用方跳过,不报错。
 */
export function parseStageAssetMarkdown(markdown: string): { stage: FeatureStatus; generatedAt: string | null; goal: string } | null {
  const fields = parseFrontmatterObject(markdown)
  if (fields === null) return null
  const stage = readStringField(fields, 'stage')
  if (!isStageValue(stage)) return null
  const generated = readStringField(fields, 'generated')
  const goal = readStringField(fields, 'goal')
  return { stage, generatedAt: generated === '' ? null : generated, goal }
}

/**
 * 扫描 feature 的 stages/ 目录 → 期望行集(管线序)。目录缺失/不可读 →
 * 空集(feature 无资产 = 合法状态)。同 stage 重复文件取字典序首位。
 */
export function collectStageAssets(featuresRoot: string, featureSlug: string): StageAssetRow[] {
  const stagesDir = join(featuresRoot, featureSlug, 'stages')
  let names: string[]
  try {
    names = readdirSync(stagesDir).sort()
  } catch {
    return []
  }
  const byStage = new Map<FeatureStatus, StageAssetRow>()
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    let parsed: ReturnType<typeof parseStageAssetMarkdown>
    try {
      parsed = parseStageAssetMarkdown(readFileSync(join(stagesDir, name), 'utf8'))
    } catch {
      continue // 单文件不可读:跳过,不放大损伤(indexer 降级纪律)
    }
    if (parsed === null) continue
    if (byStage.has(parsed.stage)) continue // 同 stage 多文件:字典序首位(确定性)
    byStage.set(parsed.stage, { stage: parsed.stage, path: stageAssetPathOf(featureSlug, parsed.stage), generatedAt: parsed.generatedAt })
  }
  const ordered: StageAssetRow[] = []
  for (const stage of STAGE_PIPELINE) {
    const row = byStage.get(stage)
    if (row !== undefined) ordered.push(row)
  }
  return ordered
}

// ---------------------------------------------------------------------------
// 表 CRUD(stage_asset 唯一写入口;同步语义 = 整 feature 行集替换)
// ---------------------------------------------------------------------------

/** 行集替换:该 (project, feature) 现有行整组删除后按期望行集重写(派生纯函数语义)。 */
export function replaceStageAssets(db: RepoDb, projectId: string, featureSlug: string, assets: readonly StageAssetRow[]): void {
  db.prepare('DELETE FROM stage_asset WHERE project_id = ? AND feature_slug = ?').run(projectId, featureSlug)
  const insert = db.prepare('INSERT INTO stage_asset (project_id, feature_slug, stage, path, generated_at) VALUES (?, ?, ?, ?, ?)')
  for (const asset of assets) {
    insert.run(projectId, featureSlug, asset.stage, asset.path, asset.generatedAt)
  }
}

/** feature 消失(结构性删除)→ 行清理(派生索引不留尸行)。 */
export function deleteStageAssets(db: RepoDb, projectId: string, featureSlug: string): void {
  db.prepare('DELETE FROM stage_asset WHERE project_id = ? AND feature_slug = ?').run(projectId, featureSlug)
}

/**
 * 全项目重建(「派生可重建,清空重建零差异」的执行面):清本项目全部行 →
 * 重扫 features/ 下每个 feature 目录 → 重写。返回重建行数。重建与感知
 * 扫描共用 collectStageAssets + replaceStageAssets,两路径零漂移。
 */
export function rebuildStageAssetIndex(db: RepoDb, projectId: string, featuresRoot: string): number {
  db.prepare('DELETE FROM stage_asset WHERE project_id = ?').run(projectId)
  let slugs: string[]
  try {
    slugs = readdirSync(featuresRoot).sort()
  } catch {
    return 0
  }
  let count = 0
  for (const slug of slugs) {
    const assets = collectStageAssets(featuresRoot, slug)
    replaceStageAssets(db, projectId, slug, assets)
    count += assets.length
  }
  return count
}

/** 行集读取(管线序;UF2 资产面/门态动词共用)。 */
export function listStageAssetRows(db: RepoDb, projectId: string, featureSlug: string): StageAssetRow[] {
  const rows = db
    .prepare('SELECT stage, path, generated_at FROM stage_asset WHERE project_id = ? AND feature_slug = ?')
    .all(projectId, featureSlug) as Array<{ readonly stage: FeatureStatus; readonly path: string; readonly generated_at: string | null }>
  const order = new Map(STAGE_PIPELINE.map((stage, index) => [stage, index]))
  return rows
    .map(row => ({ stage: row.stage, path: row.path, generatedAt: row.generated_at }))
    .sort((a, b) => (order.get(a.stage) ?? STAGE_PIPELINE.length) - (order.get(b.stage) ?? STAGE_PIPELINE.length))
}
