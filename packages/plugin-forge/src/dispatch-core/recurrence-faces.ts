// dispatch-core · recurrence 生产装配面工厂（loop-recurrence-hardening——bug 0db72bcb
// 装配断链修复）：生产装配径两只读 face 的单一构造口。
//
// · findRecurrenceCandidates = ctx.forgeBugs 域服务只读聚合的结构化消费（四域互禁不破——
//   插件零 import core，链构建与 scope 口径归 core bugs 域层定义）；
// · modelingReportPresent = 结算旁挂回收（settle.ts）同源的卷宗路径派生：提案卷宗
//   .forge/docs/proposals/<slug>/issues/<localId>/ 顶层存在报告 .md 即 true（非递归——
//   incident 等子目录不扫，零清单配置）。探测面只读、fail-soft：项目目录解析缺席/目录
//   不在/IO 故障一律 false（= 报告不在场，T3 拦截保守成立）。
//
// T2 疑似同族警示（core submitTask）/ T3 同缝拦截（claim 守卫）/ triage 两信号 / add-fix
// vars（T0 判例注入）四处机制生产生效的装配前提——经本工厂注入 createLoopDriver /
// createTriageHook 生产 deps（plugin-forge index.ts 装配缝）。
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BugRecurrenceCandidate } from '@dsh-forge/contracts'
import type { ModelingReportPresentFace, SameSeamRecurrenceFace } from './claim.js'

/** core bugs 域服务的插件侧结构化消费面收窄（本工厂消费位——tools ForgeBugsToolFace 结构兼容） */
export interface RecurrenceBugsFace {
  findRecurrenceCandidates(
    projectId: string,
    scope: { readonly slug: string; readonly localId: string; readonly files: readonly string[] },
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

/** 卷宗建模报告探测（顶层 .md 非递归——与结算旁挂回收同源路径派生，fail-soft 缺席 false） */
function modelingReportPresentOf(resolveProjectDir: RecurrenceFacesDeps['resolveProjectDir']): ModelingReportPresentFace {
  return (input) => {
    try {
      const ws = resolveProjectDir(input.projectId)
      if (ws === undefined || ws === '') return false
      const issuesDir = join(ws, '.forge', 'docs', 'proposals', input.slug, 'issues', input.localId)
      return readdirSync(issuesDir, { withFileTypes: true }).some(
        (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'),
      )
    } catch {
      return false // fail-soft：解析/IO 故障 = 报告不在场（拦截保守成立，不抛）
    }
  }
}

export function createRecurrenceFaces(deps: RecurrenceFacesDeps): RecurrenceFaces {
  return {
    // SameSeamRecurrenceScope（归属标识）→ core bugs 域 BugRecurrenceScope 适配：files = []
    // = 派发径容器内全链（域层口径——files 收窄归结算径），容器归属过滤由域层按 slug 前缀承担。
    findRecurrenceCandidates: (projectId, scope) =>
      deps.bugs.findRecurrenceCandidates(projectId, { slug: scope.slug, localId: scope.localId, files: [] }),
    modelingReportPresent: modelingReportPresentOf(deps.resolveProjectDir),
  }
}
