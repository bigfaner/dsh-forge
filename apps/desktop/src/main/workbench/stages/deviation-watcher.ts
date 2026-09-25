// workbench/stages/deviation-watcher — feature 级偏离检测(任务 4.2,
// tech-design §Interface 5 偏离 / §Interface 1 deviation_detected)。
//
// 检测对象:非内核发起的 manifest status 变更(外部会话跨阶段操作 —— 终端
// CLI / 冻结 CC 插件)。本模块挂接 M2 watcher/感知基座(services.ts 的
// scan seam,1.5 reingest-watcher 同款装配位),但方向相反:**每轮感知扫描
// 之前**调用 beforeScan —— 判据需要 pre-scan 快照:
//
//   检出   活性 manifest frontmatter status(词表内)≠ feature_snapshot
//          .status(扫描前读)→ 非内核变更。内核 advanceStage(4.1)对
//          manifest 与快照是同步成对写(单线程事件环内无扫描可插入两写
//          之间),故「manifest ≠ 快照」恒等于外部变更 —— 无需记账内核
//          写序;
//   跳过   快照无行(kernel 不认识的 feature = M2 结构性新增路径,非跨
//          阶段操作)/ manifest 缺席或损坏 / status 越出词表 —— 零信号,
//          不报错(损坏面由扫描 failures 承载);
//   偏离   feature_snapshot.deviated=1 + last_external_at(内核铸造 ISO
//          时戳)+ deviation_detected 事件(载荷 = featureSlug;
//          projectId 恒在 —— dispatch_updated 扩载荷同款,消费面按激活
//          项目过滤);
//   跟随   检出后本轮扫描随即把快照收敛到 manifest(读侧跟随 —— manifest
//          仍为 feature 阶段事实源之一);收敛后 manifest = 快照,后续轮次
//          天然零重复事件(同一外部变更只报一次;再变即再报);
//   清除   偏离标记持续至下次内核合法推进(advance-service 推进成功即清
//          deviated;last_external_at 保留为审计痕迹;门拒绝与终态 no-op
//          不算合法推进,不清除)。
//
// Hard Rules(PRD G4/G8 + 任务 4.2):偏离仅为呈现,不产生任何阻断交互;
// 检测失败仅日志(ERR_WORKBENCH_DEVIATION 收敛于本地结构化 log,不弹 UI)。
// beforeScan 同步、永不抛错;对 forge 文件零写入(外部会话不硬阻断 ——
// manifest 字节与 mtime 原样)。
//
// 与 1.5 分工:项目级偏离(已迁移项目 index.json 复现)归 migration/
// reingest-watcher(事件载荷 = projectId);feature 级(manifest 跨阶段)
// 归本模块 —— 同通道不同载荷,批合并键含 featureSlug 互不吞并。

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shellLog } from '../../log.ts'
import type { WorkbenchEvent } from '../indexer/diff.ts'
import { resolveFeaturesDir, type ScanTarget } from '../indexer/scan.ts'
import type { RepoDb } from '../repos/types.ts'
import { listFeatureSnapshots, markFeatureDeviation } from '../repos/feature-snapshots.ts'
import { parseFrontmatterObject, readStringField } from '../knowledge/frontmatter.ts'
import { isStageValue } from './stage-asset-index.ts'

/** 感知面 log code(M1 口径:非致命检测失败收敛于本地结构化 log,不弹 UI)。 */
const LOG_CODE_DEVIATION = 'WORKBENCH_DEVIATION'
const LOG_CODE_DEVIATION_ERROR = 'ERR_WORKBENCH_DEVIATION'

type WatchLog = Pick<typeof shellLog, 'info' | 'warn'>

export interface DeviationHookDeps {
  readonly db: RepoDb
  /** 时钟缝(缺省真实时钟;测试注入定值)。 */
  readonly now?: () => Date
  /** 日志缝(缺省 shellLog;测试注入观测)。 */
  readonly log?: WatchLog
}

/** 挂接 M2 感知基座的偏离检测钩子(每轮感知扫描【前】调用;同步、永不抛错)。 */
export interface DeviationHook {
  beforeScan(target: ScanTarget): WorkbenchEvent[]
}

/** manifest frontmatter status 解析(词表内 → 值;缺席/损坏/越界 → null)。 */
function manifestStatusOf(featureDir: string): string | null {
  try {
    const fields = parseFrontmatterObject(readFileSync(join(featureDir, 'manifest.md'), 'utf8'))
    if (fields === null) return null
    const status = readStringField(fields, 'status')
    return isStageValue(status) ? status : null
  } catch {
    return null
  }
}

export function createDeviationHook(deps: DeviationHookDeps): DeviationHook {
  const { db } = deps
  const log = deps.log ?? shellLog
  const clock = deps.now ?? (() => new Date())

  return {
    beforeScan(target: ScanTarget): WorkbenchEvent[] {
      // kernel-known 集:快照无行的 feature = M2 结构性新增路径,不参与检测。
      let known: ReadonlyMap<string, { readonly status: string }>
      try {
        known = new Map(listFeatureSnapshots(db, target.id).map(row => [row.featureSlug, row]))
      } catch (error) {
        log.warn({
          code: LOG_CODE_DEVIATION_ERROR,
          message: `deviation check failed for project ${target.id}: snapshot read error`,
          data: { projectId: target.id, detail: error instanceof Error ? error.message : String(error) },
        })
        return []
      }
      if (known.size === 0) return []

      const featuresRoot = resolveFeaturesDir(target)
      let dirents: ReadonlyArray<{ readonly name: string; readonly isDirectory: () => boolean }>
      try {
        dirents = readdirSync(featuresRoot, { withFileTypes: true })
      } catch (error) {
        log.warn({
          code: LOG_CODE_DEVIATION_ERROR,
          message: `deviation check failed for project ${target.id}: features root unreadable`,
          data: { projectId: target.id, featuresRoot, detail: error instanceof Error ? error.message : String(error) },
        })
        return []
      }

      const events: WorkbenchEvent[] = []
      for (const dirent of dirents) {
        const snapshot = known.get(dirent.name)
        if (snapshot === undefined) continue // kernel 不认识:非检测对象
        try {
          if (!dirent.isDirectory()) continue
          const manifestStatus = manifestStatusOf(join(featuresRoot, dirent.name))
          if (manifestStatus === null) continue // 无信号(损坏面归扫描 failures)
          if (manifestStatus === snapshot.status) continue // 与内核已知一致
          const at = clock().toISOString()
          markFeatureDeviation(db, target.id, dirent.name, at)
          events.push({ type: 'deviation_detected', projectId: target.id, featureSlug: dirent.name })
          log.info({
            code: LOG_CODE_DEVIATION,
            message: `external manifest status change detected for feature ${dirent.name} of project ${target.id}: ${snapshot.status} -> ${manifestStatus}`,
            data: { projectId: target.id, featureSlug: dirent.name, from: snapshot.status, to: manifestStatus, at },
          })
        } catch (error) {
          // 感知面纪律:单 feature 检测失败仅日志,不放大、不阻断其余轮次。
          log.warn({
            code: LOG_CODE_DEVIATION_ERROR,
            message: `deviation check failed for feature ${dirent.name} of project ${target.id}`,
            data: { projectId: target.id, featureSlug: dirent.name, detail: error instanceof Error ? error.message : String(error) },
          })
        }
      }
      return events
    },
  }
}
