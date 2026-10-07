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
  it('全局拒绝 = 四族实面实名八员（fix-1/drift #10 重映射；skill 不拒；惰性 subagent 刻意不入）', () => {
    expect(WORKER_GLOBAL_DENY_TOOLS).toEqual([
      'ask_user_question',
      'subagent_fork',
      'list_agents',
      'send_message',
      'interrupt_agent',
      'workflow',
      'todo_write',
      'present',
    ])
    expect(WORKER_GLOBAL_DENY_TOOLS).not.toContain('skill')
    // 族代称已死：driver tools.restrict() 对未知名 loud 校验（3.9 实跑拆 spawn 的根因）
    for (const alias of ['ask-user', 'delegation', 'todo']) {
      expect((WORKER_GLOBAL_DENY_TOOLS as readonly string[]).includes(alias)).toBe(false)
    }
    // 惰性注册面不入表（provider 缺席环境 unknown-name 复发防线）
    expect(WORKER_GLOBAL_DENY_TOOLS).not.toContain('subagent')
  })

  it('forge 面 = 恰 submitTask + addTask（claimTask/queryTask/dispatchTask 不入 worker 面）', () => {
    expect(WORKER_FORGE_TOOLS).toEqual(['submitTask', 'addTask'])
    expect(WORKER_FORGE_TOOLS).not.toContain('claimTask')
    expect(WORKER_FORGE_TOOLS).not.toContain('queryTask')
    expect(WORKER_FORGE_TOOLS).not.toContain('dispatchTask')
  })
})

describe('AC2 工具名映射表（OQ#2 兑现·5.1——上游 0.2.0-rc.2 standard 组合实面枚举核对）', () => {
  it('全表 17 名 = forge 两动词 + 五上游族逐名（机械核对记录归 G1 pin #20）', () => {
    expect(Object.keys(WORKER_TOOL_NAME_FAMILY).sort()).toEqual([
      'addTask',
      'bash',
      'edit',
      'glob',
      'grep',
      'job_kill',
      'job_list',
      'job_output',
      'pwsh',
      'read',
      'read_image',
      'submitTask',
      'web_fetch',
      'web_search',
      'write',
    ].sort())
  })

  it('族归属逐名（fs 六 / shell 二含平台行 / jobs 三 / read-image 一 / web 二 / forge 二）', () => {
    const byFamily = new Map<WorkerToolFamily, string[]>()
    for (const [name, family] of Object.entries(WORKER_TOOL_NAME_FAMILY)) {
      byFamily.set(family, [...(byFamily.get(family) ?? []), name].sort())
    }
    expect(byFamily.get('forge')).toEqual(['addTask', 'submitTask'])
    expect(byFamily.get('fs')).toEqual(['edit', 'glob', 'grep', 'read', 'write'])
    expect(byFamily.get('shell')).toEqual(['bash', 'pwsh'])
    expect(byFamily.get('jobs')).toEqual(['job_kill', 'job_list', 'job_output'])
    expect(byFamily.get('read-image')).toEqual(['read_image'])
    expect(byFamily.get('web')).toEqual(['web_fetch', 'web_search'])
  })

  it('forge 面 ⊆ WORKER_FORGE_TOOLS（单源子集——映射表不引入 forge 新名）', () => {
    for (const [name, family] of Object.entries(WORKER_TOOL_NAME_FAMILY)) {
      if (family === 'forge') expect(WORKER_FORGE_TOOLS).toContain(name)
    }
  })
})
