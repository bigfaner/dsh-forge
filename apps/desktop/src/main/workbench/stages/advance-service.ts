// workbench/stages/advance-service — 阶段写侧服务(任务 4.1)。
//
// tech-design §Interface 5 推进/资产写腿的内核实现(读动词归 stages-service,
// 本模块零读面扩展):
//   - stageSummarize(forge.stage.summarize 的内核写面,Interface 2「文档根
//     直写」= 知识系同款:桥 → IPC 动词 → 本服务落文件,不经 forge CLI):
//     写 `features/<slug>/stages/<stage>.md`(frontmatter { stage, generated,
//     goal } + 正文摘要;generated = 内核铸造 ISO 时戳)。Hard Rule(T4 裁决):
//     阶段资产 = 单一规范文件,同阶段重写 = 覆盖更新(非 append-only)。
//     写后以感知同款实现同步 stage_asset 行集(collectStageAssets +
//     replaceStageAssets,与 scan 零漂移)——「索引随感知更新」的确定性腿。
//   - advanceStage(Interface 1 签名 advanceStage(projectId, featureSlug)):
//     门校验(活性 fs:stages/<当前阶段>.md 存在,与 getStageGate 同判定,
//     不吃索引时滞)不满足 → ERR_STAGE_GATE_UNSATISFIED + 缺失引导;满足 →
//     内核写 manifest status(阶段推进内化,归宿表 feature set/complete 的
//     「complete」腿)→ feature_snapshot 派生缓存同步 → stage_advanced 事件。
//
// 幂等口径(AC-4「重复推进请求(已是目标阶段)」行为定义明确):
//   - 管线终态 'completed' = 一切推进的最终目标 —— 已在 completed 的推进请求
//     = 幂等 no-op:返回当前投影,零写入、零事件(prefs「幂等 no-op 不产
//     事件」同款纪律);
//   - 推进成功后的重复请求 = 新当前阶段的门未满足(新阶段总结未生成)→
//     ERR_STAGE_GATE_UNSATISFIED + 引导(拒绝可观察,非静默)。
//
// manifest 写入纪律(Hard Rule:manifest 写入仅经 advanceStage 内核路径 ——
// 本模块是内核唯一的 manifest status 写面;外部直改由 4.2 watcher 判偏离,
// 推进成功 = feature_snapshot.deviated 的定义清除点,仅翻 deviated、
// last_external_at 留审计):
//   - 在场 + frontmatter 可解析 → 仅替换 status 字段(其余字段与正文原文
//     保留;status 键存在则原位替换,缺席则追加);
//   - 在场 + 无 frontmatter 块 → 原文整体保留为正文,前插 status frontmatter;
//   - 在场 + frontmatter YAML 损坏 → ERR_STAGE_MANIFEST_UNREADABLE(不可
//     安全合并即拒绝,零数据损失);
//   - 缺席 → 创建仅含 status frontmatter 的最小 manifest(内核写路径置备
//     SoT;感知扫描随即将 feature 全量收编)。
//
// 路径授权:features 根由 services.ts 注入(projects 行 → 文档根三分模型),
// 写目标 = `features/<slug>/stages/<stage>.md` / `features/<slug>/manifest.md`
// 组装产物,入参仅承词表校验后的段值(知识系 writeLesson 同款构造性授权);
// 项目缺失 → ERR_PROJECT_NOT_FOUND,feature 目录缺失 → ERR_FEATURE_NOT_FOUND
// (读动词同码口径)。

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify as stringifyYaml } from 'yaml'
import type { DocKind, FeatureStatus, RepoDb } from '../repos/types.ts'
import { WorkbenchRepoError } from '../repos/types.ts'
import { upsertFeatureSnapshot, getFeatureSnapshot, clearFeatureDeviation } from '../repos/feature-snapshots.ts'
import { DOC_KIND_ANCHORS } from '../indexer/parse-feature.ts'
import type { WorkbenchEvent } from '../indexer/diff.ts'
import { parseFrontmatterObject, splitFrontmatter, stringifyFrontmatter } from '../knowledge/frontmatter.ts'
import { resolveFeatureStage } from './artifacts-check.ts'
import {
  STAGE_PIPELINE,
  collectStageAssets,
  isStageValue,
  replaceStageAssets,
  stageAssetPathOf,
} from './stage-asset-index.ts'
import type { FeatureSummary, StageSummarizeInput, StageSummarizeResult } from '../ipc/types.ts'

/** stages 写域错误码(ERR_STAGE_GATE_UNSATISFIED = tech-design §Error 表原码)。 */
export type StageWriteErrorCode =
  | 'ERR_FEATURE_NOT_FOUND'
  | 'ERR_STAGE_GATE_UNSATISFIED'
  | 'ERR_STAGE_ASSET_INVALID'
  | 'ERR_STAGE_MANIFEST_UNREADABLE'

/** stages 写域错误(调用方契约拒绝形态;code 经 IPC 封装原码透传)。 */
export class StageWriteError extends Error {
  constructor(
    readonly code: StageWriteErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'StageWriteError'
  }
}

/** 服务依赖缝(db + features 根解析 + 事件直发端;services.ts 装配)。 */
export interface StageWriteDeps {
  readonly db: RepoDb
  /** features 根绝对路径解析;项目不存在 → null。 */
  readonly resolveFeaturesRoot: (projectId: string) => string | null
  /** stage_advanced 事件直发端(单事件批;prefs/migration 面 onEvent 同款)。 */
  readonly onEvent?: (event: WorkbenchEvent) => void
}

/** 本模块装配产物:两写动词(并入 WorkbenchVerbServices 面)。 */
export interface StageWriteService {
  /** 写/覆盖阶段资产文件 + 同步 stage_asset 索引(感知同款实现)。 */
  stageSummarize(input: StageSummarizeInput): StageSummarizeResult
  /** 推进门(校验 → manifest 写 → 快照同步 → 事件;终态 = 幂等 no-op)。 */
  advanceStage(projectId: string, featureSlug: string): FeatureSummary
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * manifest status 写(内核唯一写面;写入纪律见模块注)。
 * @param manifestPath manifest.md 绝对路径。
 * @param next 目标阶段(词表内)。
 */
function writeManifestStatus(manifestPath: string, next: FeatureStatus): void {
  let original: string | null = null
  try {
    original = readFileSync(manifestPath, 'utf8')
  } catch {
    original = null // 缺席 → 创建最小 manifest(下方统一落盘)
  }
  if (original === null) {
    writeFileSync(manifestPath, `---\nstatus: ${next}\n---\n`, 'utf8')
    return
  }
  const { raw, body } = splitFrontmatter(original)
  if (raw === null) {
    // 无 frontmatter 块:原文整体保留为正文,前插 status frontmatter。
    writeFileSync(manifestPath, `---\nstatus: ${next}\n---\n\n${original}`, 'utf8')
    return
  }
  const fields = parseFrontmatterObject(original)
  if (fields === null) {
    throw new StageWriteError(
      'ERR_STAGE_MANIFEST_UNREADABLE',
      'manifest frontmatter of this feature is malformed YAML — the kernel cannot merge a stage advance into it safely (fix the manifest frontmatter first)',
      `rewrite target: manifest.md status → ${next}`,
    )
  }
  fields.status = next // 原位替换(键在则序不变,缺席则追加)
  writeFileSync(manifestPath, `---\n${stringifyYaml(fields).trimEnd()}\n---${body}`, 'utf8')
}

/** stage_advanced 事件构造(tech-design §Interface 1 事件扩展;projectId 载荷 = dispatch_updated 扩载荷同款,消费面按激活项目过滤)。 */
function stageAdvancedEvent(projectId: string, featureSlug: string): WorkbenchEvent {
  return { type: 'stage_advanced', projectId, featureSlug }
}

export function createStageWriteService(deps: StageWriteDeps): StageWriteService {
  const { db } = deps

  /** 项目存在 + feature 目录存在(与读动词统一前置/同码)。 */
  const requireFeature = (projectId: string, featureSlug: string): { featuresRoot: string; featureDir: string } => {
    const featuresRoot = deps.resolveFeaturesRoot(projectId)
    if (featuresRoot === null) {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
    }
    const featureDir = join(featuresRoot, featureSlug)
    if (!isDirectory(featureDir)) {
      throw new StageWriteError(
        'ERR_FEATURE_NOT_FOUND',
        `feature directory features/${featureSlug} does not exist (list features first to see the existing slugs)`,
      )
    }
    return { featuresRoot, featureDir }
  }

  /** feature_snapshot → FeatureSummary 投影(终态 no-op 返回面)。 */
  const summaryOf = (projectId: string, featureSlug: string, fallbackStatus: FeatureStatus): FeatureSummary => {
    const snapshot = getFeatureSnapshot(db, projectId, featureSlug)
    if (snapshot !== null) {
      return {
        slug: snapshot.featureSlug,
        status: snapshot.status,
        docKinds: [...snapshot.docKinds],
        taskTotal: snapshot.taskTotal,
        taskCompleted: snapshot.taskCompleted,
        updatedAt: snapshot.updatedAt,
        deviated: snapshot.deviated,
      }
    }
    // 无快照行(从未扫描):返回零计数投影,不落行(no-op = 零写入)。
    return {
      slug: featureSlug, status: fallbackStatus, docKinds: [], taskTotal: 0, taskCompleted: 0,
      updatedAt: new Date().toISOString(), deviated: false,
    }
  }

  return {
    stageSummarize(input: StageSummarizeInput): StageSummarizeResult {
      if (!isStageValue(input.stage)) {
        throw new StageWriteError(
          'ERR_STAGE_ASSET_INVALID',
          `stage ${JSON.stringify(input.stage)} is outside the forge stage vocabulary ${STAGE_PIPELINE.join('/')}`,
        )
      }
      if (input.goal.trim() === '') {
        throw new StageWriteError('ERR_STAGE_ASSET_INVALID', 'goal must be a non-empty string (frontmatter goal carries the stage goal)')
      }
      if (input.summary.trim() === '') {
        throw new StageWriteError('ERR_STAGE_ASSET_INVALID', 'summary must be a non-empty string (the asset body carries the stage summary)')
      }
      const { featuresRoot, featureDir } = requireFeature(input.projectId, input.featureSlug)

      // 单一规范文件(T4):stages/<stage>.md,重写 = 覆盖更新。序列化 =
      // stringifyFrontmatter(知识系写路径同款;键序 stage/generated/goal)。
      const generatedAt = new Date().toISOString()
      const stagesDir = join(featureDir, 'stages')
      mkdirSync(stagesDir, { recursive: true })
      writeFileSync(
        join(stagesDir, `${input.stage}.md`),
        stringifyFrontmatter({ stage: input.stage, generated: generatedAt, goal: input.goal }, input.summary),
        'utf8',
      )

      // 索引随感知更新:与 scanForgeFiles 共用同一同步实现(collect +
      // replace 行集替换),写后即就位,零感知时滞。
      replaceStageAssets(db, input.projectId, input.featureSlug, collectStageAssets(featuresRoot, input.featureSlug))

      const { stage: featureStage } = resolveFeatureStage(db, input.projectId, input.featureSlug, featureDir)
      return {
        stage: input.stage,
        path: stageAssetPathOf(input.featureSlug, input.stage),
        generatedAt,
        featureStage,
        gateOpen: isFile(join(featureDir, 'stages', `${featureStage}.md`)),
      }
    },

    advanceStage(projectId: string, featureSlug: string): FeatureSummary {
      const { featureDir } = requireFeature(projectId, featureSlug)
      const { stage } = resolveFeatureStage(db, projectId, featureSlug, featureDir)

      // 幂等口径①:管线终态 = 一切推进的最终目标 —— 已在 completed 的重复
      // 推进请求 = no-op(零写入、零事件;返回当前投影)。
      if (stage === 'completed') {
        return summaryOf(projectId, featureSlug, 'completed')
      }

      // 门校验(活性 fs,与 getStageGate 同判定):当前阶段总结已生成才可推进。
      if (!isFile(join(featureDir, 'stages', `${stage}.md`))) {
        throw new StageWriteError(
          'ERR_STAGE_GATE_UNSATISFIED',
          `stage gate unsatisfied: the summary asset of the current stage '${stage}' has not been generated yet`,
          `missing: features/${featureSlug}/stages/${stage}.md — generate it first with the forge_stage_summarize tool (frontmatter { stage: "${stage}", goal } + summary body), then advance again`,
        )
      }

      const next = STAGE_PIPELINE[STAGE_PIPELINE.indexOf(stage) + 1]
      if (next === undefined) {
        // 防御分支:词表内非终态必有后继;不可达(零词表知识泄漏)。
        throw new StageWriteError('ERR_STAGE_GATE_UNSATISFIED', `stage '${stage}' has no successor in the pipeline`)
      }

      // 内核写 manifest status(唯一写面;正文/其余字段原文保留)。
      writeManifestStatus(join(featureDir, 'manifest.md'), next)

      // feature_snapshot 派生缓存同步(推进即时投影;计数由 upsert 语句对
      // task_snapshot 时点重算,感知重扫随后收敛权威值)。
      const docKinds: DocKind[] = DOC_KIND_ANCHORS.flatMap(([kind, anchor]) =>
        isFile(join(featureDir, anchor)) ? [kind] : [])
      const snapshot = upsertFeatureSnapshot(db, {
        projectId,
        featureSlug,
        status: next,
        docKinds,
        updatedAt: new Date().toISOString(),
      })

      // 4.2 偏离清除:内核合法推进 = 偏离标记的定义清除点(upsert 不触碰
      // deviated/last_external_at,须显式翻位;last_external_at 保留为审计
      // 痕迹)。manifest 与快照成对写 → 后续感知轮恒无「manifest ≠ 快照」,
      // 推进自身不触发偏离。门拒绝/终态 no-op 提前返回,不清除。
      clearFeatureDeviation(db, projectId, featureSlug)

      // stage_advanced 事件(仅实际推进发;载荷 = projectId + featureSlug)。
      deps.onEvent?.(stageAdvancedEvent(projectId, featureSlug))

      return {
        slug: snapshot.featureSlug,
        status: snapshot.status,
        docKinds: [...snapshot.docKinds],
        taskTotal: snapshot.taskTotal,
        taskCompleted: snapshot.taskCompleted,
        updatedAt: snapshot.updatedAt,
        // 4.2 口径:合法推进 = 偏离清除点 —— 上方 clearFeatureDeviation 刚翻
        // 位,返回面按构造即推进后状态(snapshot 捕获于清除前,不回读)。
        deviated: false,
      }
    },
  }
}
