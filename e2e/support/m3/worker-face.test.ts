// M3 5.2 SC2 worker 面（support 夹具层——Hard Rule 禁真实模型的 e2e 承载面）：
//   · worker model 与 Forge设置 一致（组装面）：workerAgentOptionsOf（已配置显式携带 /
//     未配置 undefined 回退父会话继承两态）；
//   · worker toolFilter 族收窄断言随旧包 plugin-forge dispatch-task 退役整段删除——
//     继任实函数 deriveWorkerToolFilter（plugins/task-loop host/dispatch-core）的 deny
//     矩阵断言 = plugins/task-loop/tests/dispatch/assemble.test.ts（模块④单测池）。
// workerAgentOptionsOf 期望集独立硬编码（非引常量——投影公式漂移可判）。
import { describe, expect, it } from 'vitest'
import { workerAgentOptionsOf } from '@dsh-forge/lib-api/subagent-assemble'

describe('M3 5.2 SC2 worker 路由组装（experts 折叠路由——workerAgentOptionsOf）', () => {
  it('折叠应答在场：显式携带（provider/model/reasoning 直映射——优先于父会话继承）', () => {
    expect(workerAgentOptionsOf({ entry: { provider: 'deepseek', model: 'reasoner', reasoning: 'high' } })).toEqual({
      provider: 'deepseek',
      model: 'reasoner',
      reasoningEffort: 'high',
    })
  })

  it('reasoning 三级缺省：携带 provider/model、不下发 effort', () => {
    expect(workerAgentOptionsOf({ entry: { provider: 'zai', model: 'glm-5.3-flash' } })).toEqual({
      provider: 'zai',
      model: 'glm-5.3-flash',
    })
  })

  it('全级缺席（expert-squad 缺席/settings.worker 退役）：undefined——不携带，回退父会话继承', () => {
    expect(workerAgentOptionsOf({})).toBeUndefined()
  })
})
