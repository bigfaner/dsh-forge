// G1 pin ⑯（M2 pin 池 #16，任务 4.1）：右栏 dock tab 两段注册面 + 会话头 actions 槽面声明。
// 权威：tech-design Appendix「契约面 pin 扩池」第 16 项 + Integration Specs #2/#3/#4。
// 上游面（0.2.0-rc.2）：
//   - dsh-client-ui-sidebar-right `lib/types/client/contract/slots.d.ts`：`sidebar.right.pane.tab`
//     keyed 槽声明（scope session + inject SidebarRightTabInjected——useTabInfo 恒递达占用者）；
//   - 同包 `lib/types/client/index.d.ts`：Context.sidebarRightTabs（SidebarRightTabRegistry——
//     两段注册第一段）+ `tab-registry.d.ts` 类型定义面（multiple/patterns/guide/order）；
//   - 同包 `lib/client.js` 运行期契约：GuideBody 入口卡拾取 = `tab.actions.openTab(kind,
//     {replaceTab:true})`（原位替换开始 tab——产品零代码载体）+ 官方入口卡 order 先例
//     10/20/30（files/terminal/browser——产品 order 0 排最前的依据）；
//   - dsh-client-ui-conversation `lib/types/client/contract/slots.d.ts`：
//     `conversation.session.header.actions` list 槽声明（4.2 挂接 pill 的槽面依据——本 pin
//     先锚上游声明在场）。
// 我方镜像：apps/web/src/client-plugin/plugin.ts（FORGE_CLIENT_INJECT += sidebarRightTabs +
// 两段注册：registerDockTabs 两类型定义 + sidebar.right.pane.tab 两 keyed body——行为面断言
// 在 apps/web/src/client-plugin/plugin.test.ts）。
import { describe, expect, it } from 'vitest'
import { DOC_ADDRESS_PREFIX, DOC_TAB_KIND, OVERVIEW_TAB_KIND } from '../../apps/web/src/client-plugin/plugin.js'
import { dshClientDecl, expectPinnedVersion, readTypes, readUpstream, slotHole } from './pins.js'

const RIGHT_SLOTS = 'lib/types/client/contract/slots.d.ts'
const rawRightSlots = () => readUpstream('profile', '@deepseek-ai/dsh-client-ui-sidebar-right', RIGHT_SLOTS)

describe('pin ⑯-1 版本锚（右栏 tab 系统声明方）', () => {
  it('dsh-client-ui-sidebar-right = 精确 pin 版本', () => {
    expectPinnedVersion('profile', '@deepseek-ai/dsh-client-ui-sidebar-right')
  })
  it('dsh-client-ui-conversation（header.actions 槽声明方）= 精确 pin 版本', () => {
    expectPinnedVersion('profile', '@deepseek-ai/dsh-client-ui-conversation')
  })
})

describe('pin ⑯-2 `sidebar.right.pane.tab` keyed 槽声明（两段注册第二段的落点）', () => {
  it('洞 = keyed/session + inject SidebarRightTabInjected（useTabInfo 恒递达占用者）', () => {
    const hole = slotHole(rawRightSlots(), 'sidebar.right.pane.tab')
    expect(hole).toContain("kind: 'keyed'")
    expect(hole).toContain("scope: 'session'")
    expect(hole).toContain('inject: SidebarRightTabInjected')
  })

  it('SidebarRightTabInjected = hooks.tabInfo（SlotHookFactory → use<Name> 标准 props 面）', () => {
    const types = readTypes('profile', '@deepseek-ai/dsh-client-ui-sidebar-right', RIGHT_SLOTS)
    expect(types).toContain('export interface SidebarRightTabInjected {')
    expect(types).toMatch(/hooks: \{\s*tabInfo: SlotHookFactory<'sidebar\.right\.pane\.tab', UseSidebarRightTabInfo>/)
  })

  it('tab 动作面含 openResource（「dock 开文档 tab」官方载体——地址 = contentId 去重键）', () => {
    const types = readTypes('profile', '@deepseek-ai/dsh-client-ui-sidebar-right', RIGHT_SLOTS)
    expect(types).toMatch(/openResource\(address: string, options\?: SidebarRightTabPlacement & \{/)
    expect(types).toContain('readonly revealIfOpened?: boolean')
  })
})

describe('pin ⑯-3 sidebarRightTabs 注册表服务面（两段注册第一段）', () => {
  it('Context.sidebarRightTabs: SidebarRightTabRegistry（cordis 服务注入面）', () => {
    const index = readTypes('profile', '@deepseek-ai/dsh-client-ui-sidebar-right', 'lib/types/client/index.d.ts')
    expect(index).toContain('sidebarRightTabs: SidebarRightTabRegistry')
  })

  it('类型定义面：id/kind/multiple/patterns/priority/canOpen/title/guide（register 入参形状）', () => {
    const registry = readTypes('profile', '@deepseek-ai/dsh-client-ui-sidebar-right', 'lib/types/client/tab-registry.d.ts')
    expect(registry).toContain('export interface SidebarRightTabDefinition {')
    for (const field of ['readonly id: string', 'readonly kind: string', 'readonly multiple?: boolean', 'readonly patterns?: readonly string[]', "readonly priority?: SidebarRightTabPriority", 'readonly title: (address: string) => string', 'readonly guide?: readonly SidebarRightGuideEntry[]']) {
      expect(registry, `${field} 缺席`).toContain(field)
    }
    expect(registry).toMatch(/export type SidebarRightTabPriority = 'extension' \| 'builtin' \| 'fallback'/)
  })

  it('claim = contentId: address（同地址同 tab——dswf-doc 去重键的官方语义）', () => {
    const registry = readUpstream('profile', '@deepseek-ai/dsh-client-ui-sidebar-right', 'lib/types/client/tab-registry.d.ts')
    expect(registry).toContain('Stable identity of the content, which is the address itself')
    expect(registry).toContain('Two opens of the same address are the same tab')
  })

  it('GuideBody 拾取 = 原位替换开始 tab（replaceTab——上游运行期契约；AC2 载体）', () => {
    const client = readUpstream('profile', '@deepseek-ai/dsh-client-ui-sidebar-right', 'lib/client.js')
    expect(client).toContain('openTab(selected.kind, { replaceTab: true })')
  })

  it('官方入口卡 order 先例 = 10/20/30（产品 order 0 排最前的对照面）', () => {
    const files = readUpstream('profile', '@deepseek-ai/dsh-client-ui-sidebar-files', 'lib/client.js')
    expect(files).toMatch(/order: 10/)
    const terminal = readUpstream('profile', '@deepseek-ai/dsh-client-ui-sidebar-terminal', 'lib/client.js')
    expect(terminal).toMatch(/order: 20/)
    const browser = readUpstream('profile', '@deepseek-ai/dsh-client-ui-sidebar-browser', 'lib/client.js')
    expect(browser).toMatch(/order: 30/)
  })

  it('dsh.client 依赖声明：ui-sidebar-right 组合在场（服务装载链）', () => {
    const decl = dshClientDecl('profile', '@deepseek-ai/dsh-client-ui-sidebar-right')
    expect((decl.inject as string[] | undefined) ?? []).toContain('@deepseek-ai/dsh-client-ui-layout')
  })
})

describe('pin ⑯-4 `conversation.session.header.actions` 槽面声明（4.2 挂接 pill 落点的上游依据）', () => {
  it('洞 = list/session + ConversationHeaderActionOwnerProps（官方会话头动作行语言）', () => {
    const raw = readUpstream('profile', '@deepseek-ai/dsh-client-ui-conversation', RIGHT_SLOTS)
    const hole = slotHole(raw, 'conversation.session.header.actions')
    expect(hole).toContain("kind: 'list'")
    expect(hole).toContain("scope: 'session'")
    expect(hole).toContain('owner: ConversationHeaderActionOwnerProps')
  })
})

describe('pin ⑯-5 产品镜像面（插件注册键与上游口径一致）', () => {
  it('两 kind = dswf-overview / dswf-doc；文档地址前缀 = dsh-resource:// 资源面 scheme', () => {
    expect(OVERVIEW_TAB_KIND).toBe('dswf-overview')
    expect(DOC_TAB_KIND).toBe('dswf-doc')
    expect(DOC_ADDRESS_PREFIX).toBe(`${'dsh-resource://'}${DOC_TAB_KIND}/`)
  })
})
