// 1.1（M3）AC2 —— worker 收窄矩阵常量 pin（tech-design §Interface 2 收窄矩阵表逐格对照）。
// 断言面：任务类型族四值 exhaustive 分割 TASK_TYPES 20 值 / 矩阵 ✓ 表逐格 / 全局拒绝集 /
// forge 面恰两动词（claimTask/queryTask/dispatchTask 不入 worker 面）/ 映射表骨架（OQ#2）。
import { describe, expect, expectTypeOf, it } from 'vitest'
import { TASK_TYPES } from './labels.js'
import {
  WORKER_FORGE_TOOLS,
  WORKER_GLOBAL_DENY_TOOLS,
  WORKER_TASK_FAMILIES,
  WORKER_TASK_FAMILY_BY_TYPE,
  WORKER_TOOL_FAMILIES,
  WORKER_TOOL_MATRIX,
  WORKER_TOOL_NAME_FAMILY,
  type WorkerTaskFamily,
  type WorkerToolFamily,
} from './worker-matrix.js'

describe('AC2 任务类型族：四族 exhaustive 分割 TASK_TYPES 20 值', () => {
  it('族词汇恰四值（coding/doc/gate/validation——Interface 2 脚注）', () => {
    expect(WORKER_TASK_FAMILIES).toEqual(['coding', 'doc', 'gate', 'validation'])
    expectTypeOf<WorkerTaskFamily>().toEqualTypeOf<'coding' | 'doc' | 'gate' | 'validation'>()
  })

  it('类型 → 族映射 exhaustive 覆盖 TASK_TYPES 全部 20 值（Record 判别单测）', () => {
    expect(Object.keys(WORKER_TASK_FAMILY_BY_TYPE).sort()).toEqual([...TASK_TYPES].sort())
    for (const t of TASK_TYPES) {
      expect(WORKER_TASK_FAMILIES).toContain(WORKER_TASK_FAMILY_BY_TYPE[t])
    }
  })

  it('四族分割不重不漏：coding 10 + doc 5 + gate 1 + validation 4 = 20', () => {
    const byFamily = new Map<WorkerTaskFamily, number>()
    for (const t of TASK_TYPES) {
      const f = WORKER_TASK_FAMILY_BY_TYPE[t]
      byFamily.set(f, (byFamily.get(f) ?? 0) + 1)
    }
    expect(byFamily).toEqual(new Map([['coding', 10], ['doc', 5], ['gate', 1], ['validation', 4]]))
  })

  it('族成员逐值 pin（¹ coding 含 test-gen 三值与 test-run；² doc 五值；³ 验证四值）', () => {
    expect(WORKER_TASK_FAMILY_BY_TYPE['coding-fix']).toBe('coding')
    expect(WORKER_TASK_FAMILY_BY_TYPE['test-run']).toBe('coding')
    expect(WORKER_TASK_FAMILY_BY_TYPE['test-gen-scripts']).toBe('coding')
    expect(WORKER_TASK_FAMILY_BY_TYPE.doc).toBe('doc')
    expect(WORKER_TASK_FAMILY_BY_TYPE['doc-drift']).toBe('doc')
    expect(WORKER_TASK_FAMILY_BY_TYPE.gate).toBe('gate')
    expect(WORKER_TASK_FAMILY_BY_TYPE['validation-ux']).toBe('validation')
    expect(WORKER_TASK_FAMILY_BY_TYPE['eval-journey']).toBe('validation')
  })
})

describe('AC2 收窄矩阵 ✓ 表：任务类型族 × 工具族逐格（Interface 2 矩阵表机械对照）', () => {
  it('工具族词汇恰六值（fs/shell/jobs/read-image/web/forge）', () => {
    expect(WORKER_TOOL_FAMILIES).toEqual(['fs', 'shell', 'jobs', 'read-image', 'web', 'forge'])
    expectTypeOf<WorkerToolFamily>().toEqualTypeOf<'fs' | 'shell' | 'jobs' | 'read-image' | 'web' | 'forge'>()
  })

  it('矩阵 = 4×6 全格布尔（Record 判别单测——缺格即编译红）', () => {
    expect(Object.keys(WORKER_TOOL_MATRIX).sort()).toEqual([...WORKER_TASK_FAMILIES].sort())
    for (const f of WORKER_TASK_FAMILIES) {
      expect(Object.keys(WORKER_TOOL_MATRIX[f]).sort()).toEqual([...WORKER_TOOL_FAMILIES].sort())
    }
  })

  it('fs 读写/搜索全放；shell（含 git）全放（doc 亦仓库变更）', () => {
    for (const f of WORKER_TASK_FAMILIES) {
      expect(WORKER_TOOL_MATRIX[f].fs).toBe(true)
      expect(WORKER_TOOL_MATRIX[f].shell).toBe(true)
    }
  })

  it('jobs：coding/gate/验证放行、doc 拒（长跑测试面）；read_image：coding（UI 断言截图）+ 验证、doc/gate 拒', () => {
    expect(WORKER_TOOL_MATRIX.coding.jobs).toBe(true)
    expect(WORKER_TOOL_MATRIX.gate.jobs).toBe(true)
    expect(WORKER_TOOL_MATRIX.validation.jobs).toBe(true)
    expect(WORKER_TOOL_MATRIX.doc.jobs).toBe(false)
    expect(WORKER_TOOL_MATRIX.coding['read-image']).toBe(true)
    expect(WORKER_TOOL_MATRIX.validation['read-image']).toBe(true)
    expect(WORKER_TOOL_MATRIX.doc['read-image']).toBe(false)
    expect(WORKER_TOOL_MATRIX.gate['read-image']).toBe(false)
  })

  it('web 仅验证族放行（coding/doc/gate 拒）；forge 面（submitTask + addTask）全放', () => {
    expect(WORKER_TOOL_MATRIX.validation.web).toBe(true)
    expect(WORKER_TOOL_MATRIX.coding.web).toBe(false)
    expect(WORKER_TOOL_MATRIX.doc.web).toBe(false)
    expect(WORKER_TOOL_MATRIX.gate.web).toBe(false)
    for (const f of WORKER_TASK_FAMILIES) {
      expect(WORKER_TOOL_MATRIX[f].forge).toBe(true)
    }
  })
})

describe('AC2 全局拒绝集 + forge 面两动词（worker 面不含派发动词）', () => {
  it('全局拒绝 = ask-user/delegation/todo/present（一切 worker；skill 不拒）', () => {
    expect(WORKER_GLOBAL_DENY_TOOLS).toEqual(['ask-user', 'delegation', 'todo', 'present'])
    expect(WORKER_GLOBAL_DENY_TOOLS).not.toContain('skill')
  })

  it('forge 面 = 恰 submitTask + addTask（claimTask/queryTask/dispatchTask 不入 worker 面）', () => {
    expect(WORKER_FORGE_TOOLS).toEqual(['submitTask', 'addTask'])
    expect(WORKER_FORGE_TOOLS).not.toContain('claimTask')
    expect(WORKER_FORGE_TOOLS).not.toContain('queryTask')
    expect(WORKER_FORGE_TOOLS).not.toContain('dispatchTask')
  })
})

describe('AC2 工具名映射表骨架（OQ#2——逐工具名 pin 随 5.1 按当期上游工具面核对兑现）', () => {
  it('骨架仅含确证的 forge 面两动词（其余工具名 5.1 入 pin）', () => {
    expect(Object.keys(WORKER_TOOL_NAME_FAMILY).sort()).toEqual(['addTask', 'submitTask'])
    expect(WORKER_TOOL_NAME_FAMILY.submitTask).toBe('forge')
    expect(WORKER_TOOL_NAME_FAMILY.addTask).toBe('forge')
  })
})
