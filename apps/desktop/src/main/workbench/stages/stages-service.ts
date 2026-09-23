// workbench/stages/stages-service — 阶段读动词服务(任务 3.2)。
//
// tech-design §Interface 1 编排/阶段段的读侧服务实现(checkStageArtifacts /
// getStageGate / listStageAssets;装配律 = prefs/task/knowledge 服务同型):
//   - checkStageArtifacts → artifacts-check 确定性清单(派发前检查与 UF2
//     数据源;缺失 = 警告清单,warn 不阻断);
//   - getStageGate → 门态(stages/<当前阶段>.md 存在性,活性 fs 判定 ——
//     推进请求的即时裁决面,不吃索引时滞)+ 资产列表(stage_asset 派生
//     索引,管线序;UF2 第六「阶段资产」tab 数据源);
//   - listStageAssets → stage_asset 行集(管线序)。
//
// 写侧(forge.stage.summarize / advanceStage 门内化 / stage_advanced 事件)
// 归任务 4.1;本模块零写面(读动词)。
//
// 路径授权:features 根由 services.ts 注入(projects 行 → 文档根三分模型
// 解析);feature 目录缺失 → ERR_FEATURE_NOT_FOUND(knowledge feature 面
// 同码口径),项目缺失 → ERR_PROJECT_NOT_FOUND。

import { statSync } from 'node:fs'
import { join } from 'node:path'
import type { RepoDb } from '../repos/types.ts'
import { WorkbenchRepoError } from '../repos/types.ts'
import { checkStageArtifacts, resolveFeatureStage } from './artifacts-check.ts'
import { listStageAssetRows, stageAssetPathOf } from './stage-asset-index.ts'
import type { StageArtifactsReport, StageAssetRow, StageGateInfo } from '../ipc/types.ts'

/** stages 域错误码(feature 缺失;与 knowledge feature 面同码)。 */
export type StageErrorCode = 'ERR_FEATURE_NOT_FOUND'

/** stages 域错误(读动词的调用方契约拒绝形态)。 */
export class StageDomainError extends Error {
  constructor(
    readonly code: StageErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'StageDomainError'
  }
}

/** 服务依赖缝(db + features 根解析;装配缺省见 services.ts,测试注入观测)。 */
export interface StagesVerbDeps {
  readonly db: RepoDb
  /** features 根绝对路径解析;项目不存在 → null。 */
  readonly resolveFeaturesRoot: (projectId: string) => string | null
}

/** 本模块装配产物:三个阶段读动词(并入 WorkbenchVerbServices 面)。 */
export interface StagesVerbService {
  checkStageArtifacts(input: { readonly projectId: string; readonly featureSlug: string }): StageArtifactsReport
  getStageGate(projectId: string, featureSlug: string): StageGateInfo
  listStageAssets(projectId: string, featureSlug: string): StageAssetRow[]
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function createStagesVerbService(deps: StagesVerbDeps): StagesVerbService {
  const { db } = deps

  /** 项目存在 + feature 目录存在(三动词统一前置)。 */
  const requireFeature = (projectId: string, featureSlug: string): { featuresRoot: string; featureDir: string } => {
    const featuresRoot = deps.resolveFeaturesRoot(projectId)
    if (featuresRoot === null) {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
    }
    const featureDir = join(featuresRoot, featureSlug)
    if (!isDirectory(featureDir)) {
      throw new StageDomainError('ERR_FEATURE_NOT_FOUND', `feature directory features/${featureSlug} does not exist (list features first to see the existing slugs)`)
    }
    return { featuresRoot, featureDir }
  }

  return {
    checkStageArtifacts(input: { readonly projectId: string; readonly featureSlug: string }): StageArtifactsReport {
      const { featuresRoot } = requireFeature(input.projectId, input.featureSlug)
      return checkStageArtifacts(db, { ...input, featuresRoot })
    },

    getStageGate(projectId: string, featureSlug: string): StageGateInfo {
      const { featureDir } = requireFeature(projectId, featureSlug)
      const { stage } = resolveFeatureStage(db, projectId, featureSlug, featureDir)
      // 门态 = 活性 fs 存在性判定(推进门语义 = 阶段总结已生成;索引行仅作
      // 资产列表呈现,不承担门裁决 —— agent 刚写完资产即可过门,不吃感知时滞)。
      let summaryGenerated = false
      try {
        summaryGenerated = statSync(join(featureDir, 'stages', `${stage}.md`)).isFile()
      } catch {
        summaryGenerated = false
      }
      return {
        featureSlug,
        stage,
        summaryGenerated,
        gateAssetPath: summaryGenerated ? stageAssetPathOf(featureSlug, stage) : null,
        assets: listStageAssetRows(db, projectId, featureSlug),
      }
    },

    listStageAssets(projectId: string, featureSlug: string): StageAssetRow[] {
      requireFeature(projectId, featureSlug)
      return listStageAssetRows(db, projectId, featureSlug)
    },
  }
}
