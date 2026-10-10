// M3 5.2 SC2 worker 面（support 夹具层——Hard Rule 禁真实模型的 e2e 承载面）：
//   · toolFilter 断言：deriveWorkerToolFilter 实函数 × 四任务型 deny 期望集（5.1 OQ#2
//     名表全表激活后的族收窄口径——fix-1 W 用例 deny 探针口径随迁；运行期真实 worker
//     探针 = 3.9 W / 5.3 dogfood）；
//   · worker model 与 Forge设置 一致（组装面）：workerAgentOptionsOf（已配置显式携带 /
//     未配置 undefined 回退父会话继承两态）；
//   · dispatchPrompt 组装面零进上下文裁剪无涉（dispatch-task 源码纪律）——本件不重复。
// 期望集独立硬编码（非引常量——deny 泄漏检查须对插件源独立，不与被检面同源；W 用例同纪律）。
import { describe, expect, it } from 'vitest'
import { deriveWorkerToolFilter, workerAgentOptionsOf } from '../../../packages/plugin-forge/src/tools/dispatch-task.js'

/** 全局 deny 八员（WORKER_GLOBAL_DENY_TOOLS 实面实名——drift #10/fix-1） */
const GLOBAL_DENY = ['ask_user_question', 'subagent_fork', 'list_agents', 'send_message', 'interrupt_agent', 'workflow', 'todo_write', 'present']
/** forge 闭环禁入四动词（矩阵 forge 族 = submitTask + addTask 恰两员） */
const FORGE_DENY = ['queryTask', 'createProposal', 'transitionProposal', 'dispatchTask']

describe('M3 5.2 SC2 worker toolFilter（deriveWorkerToolFilter 实函数——族收窄 deny 集）', () => {
  it('coding：基座 12 + web 二名（14 deny——web 族收窄）', () => {
    const { deny } = deriveWorkerToolFilter('coding-feature')
    expect([...deny].sort()).toEqual([...GLOBAL_DENY, ...FORGE_DENY, 'web_fetch', 'web_search'].sort())
  })

  it('doc：+job 三名 + read_image + web 二名（18 deny）', () => {
    const { deny } = deriveWorkerToolFilter('doc')
    expect([...deny].sort()).toEqual([...GLOBAL_DENY, ...FORGE_DENY, 'job_list', 'job_output', 'job_kill', 'read_image', 'web_fetch', 'web_search'].sort())
  })

  it('gate：+read_image + web 二名（15 deny）', () => {
    const { deny } = deriveWorkerToolFilter('gate')
    expect([...deny].sort()).toEqual([...GLOBAL_DENY, ...FORGE_DENY, 'read_image', 'web_fetch', 'web_search'].sort())
  })

  it('validation：恰基座 12（零族收窄）', () => {
    const { deny } = deriveWorkerToolFilter('validation-code')
    expect([...deny].sort()).toEqual([...GLOBAL_DENY, ...FORGE_DENY].sort())
    const evalDeny = deriveWorkerToolFilter('eval-contract').deny
    expect([...evalDeny].sort(), 'eval 族同 validation 收窄（恰基座）').toEqual([...GLOBAL_DENY, ...FORGE_DENY].sort())
  })

  it('worker 面放行面：submitTask/addTask/fs 族不在 deny（矩阵 forge 族恰两员 + 基座工具可达）', () => {
    for (const type of ['coding-feature', 'doc', 'gate', 'validation-code'] as const) {
      const { deny } = deriveWorkerToolFilter(type)
      expect(deny, `${type}：submitTask 放行（worker 自结算）`).not.toContain('submitTask')
      expect(deny, `${type}：addTask 放行（fix 链建单）`).not.toContain('addTask')
      expect(deny, `${type}：read 在场（fs 基座）`).not.toContain('read')
      expect(deny, `${type}：edit 在场（fs 基座）`).not.toContain('edit')
      expect(deny, `${type}：bash/pwsh 在场（shell 基座）`).not.toContain('bash')
    }
  })
})

describe('M3 5.2 SC2 worker model 与 Forge设置 一致（组装面——workerAgentOptionsOf）', () => {
  it('已配置：显式携带（provider/model/reasoning 直映射——优先于父会话继承）', () => {
    expect(workerAgentOptionsOf({ worker: { provider: 'deepseek', model: 'reasoner', reasoning: 'high' } })).toEqual({
      provider: 'deepseek',
      model: 'reasoner',
      reasoningEffort: 'high',
    })
  })

  it("已配置 reasoning='default'（默认值档）：携带 provider/model、不下发 effort", () => {
    expect(workerAgentOptionsOf({ worker: { provider: 'zai', model: 'glm-5.3-flash', reasoning: 'default' } })).toEqual({
      provider: 'zai',
      model: 'glm-5.3-flash',
    })
  })

  it('未配置/服务缺席：undefined——不携带，回退父会话继承', () => {
    expect(workerAgentOptionsOf(undefined)).toBeUndefined()
    expect(workerAgentOptionsOf({})).toBeUndefined()
  })
})
