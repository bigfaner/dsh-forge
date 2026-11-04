// dispatch-core · recurrence 生产装配面工厂（loop-recurrence-hardening——bug 0db72bcb
// 装配断链修复）：生产装配径两只读 face 的单一构造口。
//
// · findRecurrenceCandidates = ctx.forgeBugs 域服务只读聚合的结构化消费（四域互禁不破——
//   插件零 import core，链构建与 scope 口径归 core bugs 域层定义）；
// · modelingReportPresent = 结算旁挂回收（settle.ts）同源的卷宗路径派生，探测双轨
//   （recurrence-signal-tiering 落点双轨）：提案卷宗 .forge/docs/proposals/<slug>/issues/<localId>/
//   顶层 或 probes 卷 .forge/docs/probes/<bugId>/ 顶层（命中链任一成员）存在报告 .md 即 true
//   （非递归——incident 等子目录不扫，零清单配置）。探测面只读、三态：双轨目录均可读
//   但无报告 = false（真报告不在场，T3 拦截保守成立）；readdirSync 抛错（IO 故障）= 'error'（机制失能——消费侧
//   claim 放行 + warn 留痕，用户裁决：fail-soft 统一向「放行 + 可观测」）。
//
// T2 疑似同族警示（core submitTask）/ T3 同缝拦截（claim 守卫）/ triage 两信号 / add-fix
// vars（T0 判例注入）四处机制生产生效的装配前提——经本工厂注入 createLoopDriver /
// createTriageHook 生产 deps（plugin-forge index.ts 装配缝）。
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BugRecurrenceCandidate } from '@dsh-forge/contracts'
import { dossierIssuesDirOf, workspaceDocsRoot } from '../forge-paths.js'
import type { ModelingReportPresentFace, SameSeamRecurrenceFace } from './claim.js'

/** core bugs 域服务的插件侧结构化消费面收窄（本工厂消费位——tools ForgeBugsToolFace 结构兼容） */
export interface RecurrenceBugsFace {
  findRecurrenceCandidates(
    projectId: string,
    scope: {
      readonly slug: string
      readonly localId: string
      /** 派生源任务 id（可选——core 域事务级反查 tasks.slug 作 container_slug 归属锚，缺席回退 slug） */
      readonly sourceTaskId?: string
      readonly files: readonly string[]
    },
  ): Promise<readonly BugRecurrenceCandidate[]>
}

export interface RecurrenceFacesDeps {
  /** core forgeBugs 服务面（只读聚合——生产装配 ctx.forgeBugs 直传） */
  readonly bugs: RecurrenceBugsFace
  /** projectId → 项目工作区根（settle.ts resolveDir 同源 projects face 派生——缺席 = 探测 false） */
  readonly resolveProjectDir: (projectId: string) => string | undefined
}

export interface RecurrenceFaces {
  /** 台账 recurrence 候选只读 face（SameSeamRecurrenceFace 同形——四处机制共同消费） */
  readonly findRecurrenceCandidates: SameSeamRecurrenceFace
  /** 卷宗建模报告在场探测 face（ModelingReportPresentFace 同形——T3 解除判据） */
  readonly modelingReportPresent: ModelingReportPresentFace
}

/** 目录顶层存在报告 .md（非递归——incident 等子目录不扫） */
function hasTopLevelReport(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'),
  )
}

/**
 * 卷宗建模报告探测（双轨非递归——与结算旁挂回收同源路径派生，三态：在场 true / 真缺席
 * false / IO 故障 'error'）：① 提案卷宗 issues/<localId>/ 顶层；② probes 卷 probes/<bugId>/
 * 顶层（命中链任一成员——recurrence-signal-tiering 落点双轨，报告落 probes 即解除）。
 */
function modelingReportPresentOf(resolveProjectDir: RecurrenceFacesDeps['resolveProjectDir']): ModelingReportPresentFace {
  return (input) => {
    try {
      const ws = resolveProjectDir(input.projectId)
      if (ws === undefined || ws === '') return false
      const issuesDir = dossierIssuesDirOf(ws, input.slug, input.localId)
      if (existsSync(issuesDir) && hasTopLevelReport(issuesDir)) return true
      const docsRoot = workspaceDocsRoot(ws)
      for (const bugId of input.bugIds) {
        const probesDir = join(docsRoot, 'probes', bugId)
        if (existsSync(probesDir) && hasTopLevelReport(probesDir)) return true
      }
      return false // 双轨均可读且无报告 .md = 真「报告不在场」（拦截保守成立）
    } catch {
      return 'error' // fail-soft：IO 故障 = 机制失能（消费侧 claim 放行 + warn 留痕，不抛）
    }
  }
}

export function createRecurrenceFaces(deps: RecurrenceFacesDeps): RecurrenceFaces {
  return {
    // SameSeamRecurrenceScope（归属标识）→ core bugs 域 BugRecurrenceScope 适配：files = []
    // = 派发径容器内全链（域层口径——files 收窄归结算径）；sourceTaskId 透传——域层按其
    // 事务级反查 tasks.slug 作 container_slug 归属锚（bug bdbe8218 消解：参数做实功，非装饰死参）。
    findRecurrenceCandidates: (projectId, scope) =>
      deps.bugs.findRecurrenceCandidates(projectId, {
        slug: scope.slug,
        localId: scope.localId,
        ...(scope.sourceTaskId !== undefined ? { sourceTaskId: scope.sourceTaskId } : {}),
        files: [],
      }),
    modelingReportPresent: modelingReportPresentOf(deps.resolveProjectDir),
  }
}
