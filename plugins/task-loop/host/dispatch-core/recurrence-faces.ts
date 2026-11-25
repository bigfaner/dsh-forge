// dispatch-core · recurrence 生产装配面工厂（loop-recurrence-hardening——bug 0db72bcb
// 装配断链修复）：生产装配径两只读 face 的单一构造口。
//
// · findRecurrenceCandidates = bugs 域服务只读聚合的结构化消费（四域互禁不破——链构建与
//   scope 口径归 bugs 域层定义）；
// · modelingReportPresent = probes 卷路径派生（结算旁挂回收同源 docs 根），探测
//   .forge/docs/probes/<bugId>/ 顶层（关联锚 = recurrence 链成员 bugId——命中链任一成员
//   存在报告 .md 即 true；非递归——incident 等子目录不扫，零清单配置）。proposals/
//   <slug>/issues/<localId>/ 轨已随 proposal 域退役（proposal-domain-retirement 机检——
//   .forge/ 下无 proposals 目录）。探测面只读、三态：probes 卷可读但无报告 = false
//   （真报告不在场，T3 拦截保守成立）；readdirSync 抛错（IO 故障）= 'error'
//   （机制失能——消费侧 claim 放行 + warn 留痕，用户裁决：fail-soft 统一向「放行 + 可观测」）。
//   路径派生经注入面消费（workspaceDocsRoot——运行期取值走 deps 注入；
//   派生缝缺席 = 机制失能同 'error' 形态——消费侧放行 + warn 留痕，不静默恒拦）。
//
// T2 疑似同族警示（submitTask）/ T3 同缝拦截（claim 守卫）/ triage 两信号 / add-fix
// vars（T0 判例注入）四处机制生产生效的装配前提——经本工厂注入 createLoopDriver /
// createTriageHook 生产 deps（index.ts 装配缝）。
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { BugRecurrenceCandidate } from "@dsh-forge/contracts";
import type { ModelingReportPresentFace, SameSeamRecurrenceFace } from "./claim.js";

/** bugs 域服务的插件侧结构化消费面收窄（本工厂消费位——结构兼容注入） */
export interface RecurrenceBugsFace {
  findRecurrenceCandidates(
    projectId: string,
    scope: {
      readonly slug: string
      readonly localId: string
      /** 派生源任务 id（可选——域层事务级反查 tasks.slug 作 container_slug 归属锚，缺席回退 slug） */
      readonly sourceTaskId?: string
      readonly files: readonly string[]
    },
  ): Promise<readonly BugRecurrenceCandidate[]>;
}

export interface RecurrenceFacesDeps {
  /** bugs 域服务面（只读聚合——生产装配 ctx 服务直传） */
  readonly bugs: RecurrenceBugsFace
  /** projectId → 项目工作区根（settle.ts resolveDir 同源 projects face 派生——缺席 = 探测 false） */
  readonly resolveProjectDir: (projectId: string) => string | undefined
  /** docs 根派生注入（workspaceDocsRoot 同形——<ws>/.forge/docs；缺席 = 机制失能） */
  readonly workspaceDocsRoot?: (ws: string) => string;
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
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"),
  );
}

/**
 * 建模报告探测（probes 卷非递归——三态：在场 true / 真缺席 false / IO 故障或派生缝缺席
 * 'error'）：probes/<bugId>/ 顶层（命中链任一成员——关联锚 = recurrence 链成员 bugId，
 * 与 investigate-bug 技能 Step 3 落卷 `probes/<bugId>/` 同径，报告落 probes 即解除）。
 * proposals/<slug>/issues/<localId>/ 轨已随 proposal 域退役（proposal-domain-retirement
 * 机检——.forge/ 下无 proposals 目录，该轨恒不存在）。
 */
function modelingReportPresentOf(deps: RecurrenceFacesDeps): ModelingReportPresentFace {
  return (input) => {
    try {
      const ws = deps.resolveProjectDir(input.projectId);
      if (ws === undefined || ws === "") return false;
      if (deps.workspaceDocsRoot === undefined) {
        return "error"; // 路径派生缝缺席 = 机制失能（消费侧 claim 放行 + warn 留痕，不恒拦）
      }
      const docsRoot = deps.workspaceDocsRoot(ws);
      for (const bugId of input.bugIds) {
        const probesDir = join(docsRoot, "probes", bugId);
        if (existsSync(probesDir) && hasTopLevelReport(probesDir)) return true;
      }
      return false; // probes 卷可读且无报告 .md = 真「报告不在场」（拦截保守成立）
    } catch {
      return "error"; // fail-soft：IO 故障 = 机制失能（消费侧 claim 放行 + warn 留痕，不抛）
    }
  };
}

export function createRecurrenceFaces(deps: RecurrenceFacesDeps): RecurrenceFaces {
  return {
    // SameSeamRecurrenceScope（归属标识）→ bugs 域 BugRecurrenceScope 适配：files = []
    // = 派发径容器内全链（域层口径——files 收窄归结算径）；sourceTaskId 透传——域层按其
    // 事务级反查 tasks.slug 作 container_slug 归属锚（bug bdbe8218 消解：参数做实功，非装饰死参）。
    findRecurrenceCandidates: (projectId, scope) =>
      deps.bugs.findRecurrenceCandidates(projectId, {
        slug: scope.slug,
        localId: scope.localId,
        ...(scope.sourceTaskId !== undefined ? { sourceTaskId: scope.sourceTaskId } : {}),
        files: [],
      }),
    modelingReportPresent: modelingReportPresentOf(deps),
  };
}
