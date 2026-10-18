// e2e 取证债机制 · 红灯基线门（dispatch-loop-hardening 改进7）——e2e 套件入场前跑基线，
// 红灯清单随任务简报（E2E_BASELINE_RED 行）递达 worker：基线红灯 ≠ 本任务回归，可机械判定；
// 红灯自动生成归因卡（环境 / 陈旧断言 / 真回归 三分流）。定位：循环面基建（loop/）——
// 套件执行命令由装配方经 runSuite 注入，本模块只做解析与载荷合成（纯逻辑可单测）。
import type { AddTaskInput, ContainerRef, TaskPriority } from '@dsh-forge/contracts'

/** 基线跑批产物（ranAt = 跑批起点 ISO；error 在场 = 套件执行失败——fail-soft 空清单，不阻循环） */
export interface E2eBaselineRedList {
  readonly ranAt: string
  readonly redSpecs: readonly string[]
  readonly error?: string
}

/**
 * 套件输出 → 红灯 spec 清单（解析 `FAIL <path>` 行——vitest/jest reporter 共同形态；
 * 路径限定 .spec/.test 后缀滤除噪音；去重 + 字母序——同输出恒同清单）。
 */
export function parseE2eRedSpecs(output: string): string[] {
  const specs = new Set<string>()
  const re = /^\s*(?:FAIL|✕|×)\s+(\S+\.(?:spec|test)\.[cm]?[jt]s)\b/gm
  for (const m of output.matchAll(re)) {
    if (m[1] !== undefined) specs.add(m[1])
  }
  return [...specs].sort()
}

/**
 * 基线跑批（e2e 套件入场前调用一次）：执行注入的 runSuite 取全量输出 → 解析红灯清单。
 * 套件执行故障 fail-soft：空清单 + error 留痕——基线不可得时机制静默关闭（简报零行），
 * 循环派发不受阻（取证债可后补，循环不死锁）。
 */
export async function runE2eBaseline(runSuite: () => Promise<string>): Promise<E2eBaselineRedList> {
  const ranAt = new Date().toISOString()
  try {
    return { ranAt, redSpecs: parseE2eRedSpecs(await runSuite()) }
  } catch (cause) {
    return { ranAt, redSpecs: [], error: cause instanceof Error ? cause.message : String(cause) }
  }
}

/** 归因卡载荷（改进7 三分流）：基线红灯 spec 逐一生成 test-run 归因卡——结论三分流
 *  （环境 / 陈旧断言 / 真回归），真回归经 recordBug 落台账，修复或钉基线后新取证才可信。 */
export function attributionTaskInput(
  source: ContainerRef,
  spec: string,
  extra: { readonly projectId: string },
): AddTaskInput {
  return {
    projectId: extra.projectId,
    source,
    title: `e2e 基线红灯归因：${spec}`,
    type: 'test-run',
    priority: 'P1' as TaskPriority,
    taskDesc: [
      `本 spec 在 e2e 红灯基线（循环入场跑批）中已失败——先于本容器当前任务存在，不得归因为当前任务回归。`,
      '执行该 spec 并按三分流给出归因结论（结论写进结算 summary，附证据路径）：',
      '1. 环境——环境/依赖/时序问题：记录复现条件与证据，交由主会话裁决环境修复；',
      '2. 陈旧断言——spec 断言与现状脱节：给出断言更新建议（不直接改断言，交主会话裁决）；',
      '3. 真回归——既有行为破坏：recordBug 登记缺陷（trigger/expected/actual 全带），由主会话派修复。',
      '结论分流前禁止顺手修复 spec 或产品代码。',
    ].join('\n'),
    vars: { BASELINE_SPEC: spec },
  }
}
