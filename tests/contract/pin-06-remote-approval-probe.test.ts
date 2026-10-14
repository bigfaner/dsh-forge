// mobile-remote-approval 1.1 探针点①收口 pin：官方 dsh-api-remotes / dsh-user-approval 的
// 可反射服务名与可用面 + 官方侧栏底行扩展槽归属（提案记录段结论的机械锚）。
// 权威：上游随包分发 d.ts / lib 文本（pins 池纪律——只 pin 公开面，不 pin 内部实现细节）。
// 结论（同 proposal.md §记录）：
//   · dsh-api-remotes = 客户端 BFF 门面：Client face `inject = ['remote']`，经 ctx.remote.$mount
//     装载生成命名空间（remote.session / remote.agentPresets 等）——ctx.reflect.get('remote.session')
//     先例同型；无远程配对/设备管理命名空间（配对认证归官方网关/host-webserver 机械）。
//   · dsh-user-approval = Cordis 服务名 `approval`（ctx.approval）：request/setPolicy/overrideOf
//     三法公开面 + 审批应答经 `approval/request` waterfall 监听器——远程审批转发的官方缝。
//   · 官方侧栏底行 = 现成扩展槽 `sidebar.footer.action`（kind 'list'，声明语义
//     「Optional actions beside Settings at the sidebar foot」）——产品手机图标经此槽注入，
//     无需自造槽位。
import { describe, expect, it } from 'vitest'
import { expectPinnedVersion, norm, readUpstream, upstreamPkg } from './pins.js'

const approvalTypes = readUpstream('profile', '@deepseek-ai/dsh-user-approval', 'lib/types/index.d.ts')
const approvalLib = readUpstream('profile', '@deepseek-ai/dsh-user-approval', 'lib/index.js')
const remotesClientTypes = readUpstream('profile', '@deepseek-ai/dsh-api-remotes', 'lib/types/client/index.d.ts')
const remotesClientLib = readUpstream('profile', '@deepseek-ai/dsh-api-remotes', 'lib/client.js')
const sidebarSlots = readUpstream('profile', '@deepseek-ai/dsh-client-ui-sidebar', 'lib/types/client/contract/slots.d.ts')

describe('探针① 官方远程/审批服务 pin（profile 运行期组合物化）', () => {
  it.each([
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-user-approval',
  ])('%s = 精确 pin 版本（dev 形态组合物化在装）', (name) => {
    expectPinnedVersion('profile', name)
  })

  it('dsh-api-remotes：Client face inject = ["remote"]（ctx.remote 反射面；ctx.reflect.get 先例同型）', () => {
    expect(remotesClientTypes).toContain('export declare const inject: string[]')
    expect(norm(remotesClientTypes)).toContain("declare module '@deepseek-ai/cordis'")
    expect(norm(remotesClientTypes)).toContain('Generated Remote namespaces selected by this Client assembly')
    expect(remotesClientLib).toContain('const inject = ["remote"]')
  })

  it('dsh-api-remotes：远程命名空间含 session（remote.session 先例锚）与 agentPresets（5.2 勘误同缝）', () => {
    expect(remotesClientLib).toContain('namespace: "session"')
    expect(remotesClientLib).toContain('namespace: "agentPresets"')
  })

  it('dsh-user-approval：Cordis 服务名 approval（ctx.approval——declare module Context 增强）', () => {
    expect(norm(approvalTypes)).toContain("declare module '@deepseek-ai/cordis'")
    expect(approvalTypes).toContain('approval: ApprovalService')
    expect(upstreamPkg('profile', '@deepseek-ai/dsh-user-approval')['name']).toBe('@deepseek-ai/dsh-user-approval')
  })

  it('dsh-user-approval：可用面三法（request/setPolicy/overrideOf）+ 应答缝 approval/request waterfall', () => {
    expect(approvalTypes).toContain('request(req: ApprovalRequest): Promise<ApprovalOutcome>')
    expect(approvalTypes).toContain('setPolicy(agent: Agent, policy: ApprovalPolicy): void')
    expect(approvalTypes).toContain('overrideOf(session: Session): ApprovalPolicy | undefined')
    expect(approvalLib).toContain('"approval/request"')
  })
})

describe('探针① 官方侧栏底行扩展槽 pin', () => {
  it('dsh-client-ui-sidebar：sidebar.footer.action 槽在场（kind list·设置按钮同排脚部动作位）', () => {
    const hole = norm(sidebarSlots.match(/^ {8}'sidebar\.footer\.action': \{([\s\S]*?)^ {8}\}/m)?.[1] ?? '')
    expect(hole).not.toBe('')
    expect(hole).toContain("kind: 'list'")
    expect(hole).toContain("scope: 'root'")
  })

  it('槽声明语义 = 设置同排脚部可选动作（「beside Settings at the sidebar foot」——手机图标落位归属）', () => {
    expect(sidebarSlots).toContain('Optional actions beside Settings at the sidebar foot')
  })
})
