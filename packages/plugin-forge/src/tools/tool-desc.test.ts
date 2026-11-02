// 三工具 description 语义 pin（prompt-scoping-and-desc-trim §2.2 终版）：
// submitTask 必留五项 + 工具级负向清零（AGENTS 1.4 引用 / block_classification 细则
// 下沉参数级唯一承载）+ runtime_surface 参数级两处补句；dispatchTask 必留七点
// （单容器绑定/循环机制/无 job channel/单活跃门/resume 指针/stopTaskLoop/协作段
// 下一回合注入预告句——五结局语义下沉响应面承载）；addTask 工具级无双模式括号
// 重复（解释单点 = source_kind 参数描述）。长度上限：submitTask ≤750 / dispatchTask ≤650。
import { describe, expect, it } from 'vitest'
import type { ForgeTasksService } from '@dsh-forge/contracts'
import type { LoopDriver, LoopRegistry } from '../loop/index.js'
import { createAddTaskTool } from './add-task.js'
import { createDispatchTaskTool } from './dispatch-task.js'
import type { DispatchTaskToolDeps } from './dispatch-task.js'
import type { ForgeToolDeps } from './index.js'
import { createSubmitTaskTool } from './submit-task.js'

const checkpoints: ForgeToolDeps['checkpoints'] = {
  appendCheckpoint: async () => {
    throw new Error('not used')
  },
  listCheckpoints: async () => [],
  ensureCheckpoint: async () => {
    throw new Error('not used')
  },
}

/** 最小 deps（description 静态面——服务零触达） */
function baseDeps(): ForgeToolDeps {
  return {
    tasks: {} as ForgeTasksService,
    proposals: {} as ForgeToolDeps['proposals'],
    bugs: {} as ForgeToolDeps['bugs'],
    checkpoints,
    resolveProjectId: () => 'p-1',
  }
}

/** dispatchTask deps（loop 面桩——description 静态面零触达） */
function dispatchDeps(): DispatchTaskToolDeps {
  return { ...baseDeps(), loop: { driver: {} as LoopDriver, registry: {} as LoopRegistry } }
}

/** 参数 schema 的 description 取值 */
function paramDesc(props: Record<string, unknown>, key: string): string {
  const p = (props as Record<string, { description?: string } | undefined>)[key]
  return p?.description ?? ''
}

// ─────────────────────────── submitTask（必留五项 + 负向清零） ───────────────────────────

describe('submitTask description（§2.2 终版——基线 2016 → ~740）', () => {
  const tool = createSubmitTaskTool(baseDeps())
  const d = tool.description
  const props = (tool.parameters as { properties: Record<string, unknown> }).properties

  it('长度 ≤750 字符', () => {
    expect(d.length).toBeLessThanOrEqual(750)
  })

  it('必留①双径约束：success 必带 summary + 四门布尔；AC 任务 gate.test 必过；blocked 必带 reason', () => {
    expect(d).toContain('result=success requires a one-line summary and four gate booleans (compile/fmt/lint/test')
    expect(d).toContain('tasks with acceptance_criteria also need gate.test passing')
    expect(d).toContain('result=blocked requires the reason')
  })

  it('必留②ac 平行数组（同位成项、any met=false 拒）', () => {
    expect(d).toContain('ac_criteria/ac_met/ac_evidence parallel arrays verify each criterion one-for-one')
    expect(d).toContain('any met=false rejects')
  })

  it('必留③直收卡句（blocked 卡可径直 success 结算——3f2b7b71）', () => {
    expect(d).toContain('a blocked card may settle directly via result=success')
  })

  it('必留④evidence_debt 欠账路径存在性（blocked-vs-debt 决策时点语义）', () => {
    expect(d).toContain('evidence_debt_suite+evidence_debt_specs (success only)')
    expect(d).toContain('never stay blocked on missing e2e evidence')
  })

  it('必留⑤coverage fraction（与四门布尔同句在场）', () => {
    expect(d).toContain('coverage fraction')
  })

  it('负向清零：工具级无「AGENTS 1.4」引用、无 block_classification 细则（下沉参数级唯一承载）', () => {
    expect(d).not.toContain('AGENTS')
    expect(d).not.toContain('block_classification')
    // 参数级承载在场（工具级严格超集——归类门细则 + T2 门句）
    expect(paramDesc(props, 'block_classification_kind')).toContain('T2 classification gate')
    expect(paramDesc(props, 'block_classification_recurrence_of')).toContain('recurrence chain')
  })

  it('runtime_surface 参数级补两处：豁免前提从句 + either evidence or debt, else rejected', () => {
    const p = paramDesc(props, 'runtime_surface')
    expect(p).toContain('the exemption presupposes no subprocess/network side effects of its own')
    expect(p).toContain(
      'requires either runtime_evidence_face+runtime_evidence_artifacts (evidence done) or evidence_debt (debt declared); without either, the submit is rejected',
    )
  })

  it('下沉承载锚：files 并集规则在参数级、fix 自动恢复 source 在 output schema（工具级删除不孤儿）', () => {
    expect(paramDesc(props, 'files')).toContain('must equal their union')
    const schema = tool.output.schema as { oneOf: [{ properties: Record<string, { description?: string }> }] }
    expect(schema.oneOf[0]!.properties['restored']?.description).toContain('auto-restored by the recovery hook')
  })
})

// ─────────────────────────── dispatchTask（必留七点；五结局下沉响应面） ───────────────────────────

describe('dispatchTask description（§2.2 终版——基线 1674 → ~640）', () => {
  const tool = createDispatchTaskTool(dispatchDeps())
  const d = tool.description

  it('长度 ≤650 字符（锚 ~560，±15% 容差）', () => {
    expect(d.length).toBeLessThanOrEqual(650)
  })

  it('必留七点：单容器绑定 / 循环机制 / 无 job channel / 单活跃门 / resume 指针 / stopTaskLoop / 协作段预告句', () => {
    expect(d).toContain('ONE container') // 单容器绑定（成对必填 + 无池级盲选）
    expect(d).toContain('source_kind and source_slug are BOTH required (no pool-wide mode)')
    expect(d).toContain('same loop core as the /run-dag-tasks instruction') // 循环机制（同源核心）
    expect(d).toContain('no run_in_background/job_output/job_kill') // 无 job channel
    expect(d).toContain('A session runs at most one loop at a time') // 单活跃门
    expect(d).toContain('suspension summary') // resume 指针（挂起冻结 + 摘要 + 显式续接）
    expect(d).toContain('only resume: true re-enters')
    expect(d).toContain('idempotent re-entry')
    expect(d).toContain('stopTaskLoop') // 停止入口
    expect(d).toContain('collaboration-protocol section into your system prompt next turn') // 协作段下一回合注入预告句
  })

  it('五结局枚举不在工具级（下沉响应面承载——五类响应各自自解释）', () => {
    expect(d).not.toContain('Outcomes:')
  })
})

// ─────────────────────────── addTask（工具级无双模式括号重复） ───────────────────────────

describe('addTask description（§2.2——双模式解释下沉 source_kind 参数级唯一承载）', () => {
  const tool = createAddTaskTool(baseDeps())
  const d = tool.description
  const props = (tool.parameters as { properties: Record<string, unknown> }).properties

  it('工具级无 feature/proposal 双模式括号解释；提及单点收敛为参数描述', () => {
    expect(d).not.toContain('expedition')
    expect(d).not.toContain('blitz')
    expect(d).toContain('source_kind: feature or proposal') // 提及但不再展开双模式
    expect(paramDesc(props, 'source_kind')).toContain('feature = expedition chain / proposal = blitz direct-attach')
  })
})
