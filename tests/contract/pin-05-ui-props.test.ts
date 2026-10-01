// G1 pin ⑤（S2 清单处置）：官方 ui-* props——逐项入池或显式记残留（任务 2.13 AC3，供 3.9 收口）。
// 权威：tech-design Appendix 契约面清单第 5 项 + S2 清点（spikes/s2-web-shell-inventory.md §2/§3）。
//
// ── 已入池（本文件 + pin-03）───────────────────────────────────────────────────
// ① ui-chat：dsh.client 声明（inject 11 包 + platform web——S2 文档计「12」系笔误，实装 11）；
//    自有槽 6 洞全集；ChatViewInjected 成员集（11 成员——mount props 注入面）
// ② ui-conversation：dsh.client 声明（inject 8 包）；槽面已文档化子集（含 conversation.view
//    = list/session——产品视图注册目标位）；ConversationStoreState = {draft, view, viewRequest}
//    （视图偏好/聚焦请求语义）
// ③ ui-trajectory：dsh.client 声明（inject 5 包）；TrajectoryContribution 8 类 kind 全集 +
//    TrajectorySnapshot 顶层成员集（轨迹 tab 数据源契约）
// ④ ui-theme：dsh.client 声明（inject 5 包 + immediately:true——stage-one 预取，唯一行）
// ⑤ ui-dockkit：零 cordis 静态库（无 dsh.client 声明——非 boot 插件，web 锚构建期消费）
// （S2 残留 #1 sidebar 槽位 props 已由 pin-03 入池——处置完成）
//
// ── 残留（显式列出，供 3.9 收口）─────────────────────────────────────────────
// R1 ui-chat/ui-conversation 服务级 cordis inject 清单（['slots','sessions','fileUpload',…]——
//    运行期注册面，无随包分发稳定文本锚）→ e2e/dogfood 验证（S2 §4#2 同处置）
// R2 uiConversation.binding().target() 快照通道 + ConversationViewDefinition 组装线（运行期服务
//    面）→ 2.11 消费时经 e2e 断言，或升级窗展开 types 后再入池
// R3 ui-theme 8 张样式表清单与 installThemeStyles 注入细节（内部配置）→ e2e 已断言
//    style[data-plugin] 激活面（S2 §1），清单枚举不 pin（防脆断）
// R4 ConversationTimelineSnapshot / ConversationTurnDataMap 深层 wire 形状 → 2.11 按需（S2 §4#5）
// R5 HMR 全图 sync / locale 面细节 → S2 §4#3/#4（观察项 / 2.x 随需）
import { describe, expect, it } from 'vitest'
import {
  dshClientDecl,
  expectPinnedVersion,
  interfaceMembers,
  norm,
  readUpstream,
  slotMapKeys,
  upstreamPkg,
} from './pins.js'

describe('pin ⑤-1 版本锚（profile 组合物化）', () => {
  it.each([
    '@deepseek-ai/dsh-client-ui-chat',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-trajectory',
    '@deepseek-ai/dsh-client-ui-theme',
  ])('%s（profile 锚）= 精确 pin 版本', (name) => {
    expectPinnedVersion('profile', name)
  })
  it('@deepseek-ai/dsh-client-ui-dockkit（web 锚，构建期静态库）= 精确 pin 版本', () => {
    expectPinnedVersion('web', '@deepseek-ai/dsh-client-ui-dockkit')
  })
})

describe('pin ⑤-2 ui-chat（S2 §2.1：conversation.view 注册面 + ChatViewInjected）', () => {
  const raw = readUpstream('profile', '@deepseek-ai/dsh-client-ui-chat', 'lib/types/client/contract/slots.d.ts')

  it('dsh.client：platform=web + inject 11 包（S2 计「12」系笔误——实装清单为 11）', () => {
    const decl = dshClientDecl('profile', '@deepseek-ai/dsh-client-ui-chat')
    expect(decl['platform']).toBe('web')
    expect(decl['immediately']).toBeUndefined()
    expect(decl['inject']).toEqual([
      '@deepseek-ai/dsh-api-session-controller',
      '@deepseek-ai/dsh-api-workspace-controller',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-conversation',
      '@deepseek-ai/dsh-client-ui-input-trigger',
      '@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-ui-renderer',
      '@deepseek-ai/dsh-client-ui-session',
      '@deepseek-ai/dsh-client-ui-settings',
      '@deepseek-ai/dsh-client-ui-sidebar-right',
      '@deepseek-ai/dsh-client-ui-workspace',
    ])
  })

  it('自有槽 6 洞全集（chat.node / message.images / commandview / turnTail / assistant-actions / quota-notice）', () => {
    expect(slotMapKeys(raw)).toEqual([
      'conversation.chat.assistant-actions',
      'conversation.chat.commandview',
      'conversation.chat.node',
      'conversation.chat.turnTail',
      'conversation.message.images',
      'shell.quota-notice',
    ])
  })

  it('ChatViewInjected 成员集 = 11（hooks / keyedHooks / 动作面 9——mount props 注入面）', () => {
    expect(interfaceMembers(raw, 'ChatViewInjected')).toEqual([
      'chatScroll',
      'fileMentions',
      'forkAt',
      'hooks',
      'keyedHooks',
      'loadImage',
      'loadOlder',
      'loadThrough',
      'openExternalLink',
      'openFile',
      'openSkill',
    ])
  })

  it('ChatViewSlotProps 组装 = PropsRuntime<conversation.view> + 子槽渲染 + store + inject + locale', () => {
    const types = norm(raw)
    expect(types).toContain(
      "PropsRuntime<'conversation.view'> & PropsRenderSlots<'conversation.chat.node' | 'conversation.message.images'>",
    )
  })
})

describe('pin ⑤-3 ui-conversation（S2 §2.2：槽面全集 + 视图偏好语义）', () => {
  const raw = readUpstream('profile', '@deepseek-ai/dsh-client-ui-conversation', 'lib/types/client/contract/slots.d.ts')
  const viewTypes = readUpstream('profile', '@deepseek-ai/dsh-client-ui-conversation', 'lib/types/client/contract/views.d.ts')

  it('dsh.client：platform=web + inject 8 包', () => {
    const decl = dshClientDecl('profile', '@deepseek-ai/dsh-client-ui-conversation')
    expect(decl['platform']).toBe('web')
    expect(decl['inject']).toEqual([
      '@deepseek-ai/dsh-api-session-controller',
      '@deepseek-ai/dsh-client-file-upload',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-ui-renderer',
      '@deepseek-ai/dsh-client-ui-session',
      '@deepseek-ai/dsh-client-ui-settings',
      '@deepseek-ai/dsh-client-ui-workspace',
    ])
  })

  it('槽面已文档化子集在场（S2 表 18 行——壳全会话面，非穷举）', () => {
    const declared = new Set(slotMapKeys(raw))
    for (const hole of [
      'main.conversation',
      'conversation.session',
      'conversation.view',
      'conversation.header',
      'conversation.header.leading',
      'conversation.session.header',
      'conversation.session.header.lineage',
      'conversation.session.header.actions',
      'conversation.session.header.utilities',
      'conversation.session.header.corner',
      'conversation.composer',
      'conversation.hero.workspace',
      'conversation.hero.brand.mark',
      'conversation.hero.agentPreset',
      'conversation.input.dock',
      'conversation.input.overlay',
      'conversation.composer.dock',
    ]) {
      expect(declared.has(hole), `ui-conversation 槽 ${hole} 缺席`).toBe(true)
    }
  })

  it("conversation.view = list/session（注册目标视图逐个渲染——产品 2.11/官方 chat+trajectory 的挂载位）", () => {
    const types = norm(raw)
    expect(types).toContain("'conversation.view': { kind: 'list'; scope: 'session';")
  })

  it('ConversationStoreState = {draft, view, viewRequest}（draft 跨会话持久 + view=null 解析 chat + 一次性聚焦请求）', () => {
    expect(interfaceMembers(viewTypes, 'ConversationStoreState')).toEqual(['draft', 'view', 'viewRequest'])
    const types = norm(viewTypes)
    expect(types).toContain('survives session switches and reloads')
    expect(types).toContain('null resolves to Chat when registered')
  })
})

describe('pin ⑤-4 ui-trajectory（S2 §2.3：官方轨迹 tab 数据源契约）', () => {
  const raw = readUpstream('profile', '@deepseek-ai/dsh-client-ui-trajectory', 'lib/types/client/trajectory-contract.d.ts')

  it('dsh.client：platform=web + inject 5 包（无自有服务）', () => {
    const decl = dshClientDecl('profile', '@deepseek-ai/dsh-client-ui-trajectory')
    expect(decl['platform']).toBe('web')
    expect(decl['inject']).toEqual([
      '@deepseek-ai/dsh-api-session-controller',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-conversation',
      '@deepseek-ai/dsh-client-ui-renderer',
      '@deepseek-ai/dsh-client-ui-session',
    ])
  })

  it('TrajectoryContribution = 8 类 kind 全集（S2 计数吻合；提取域限定该联合类型块）', () => {
    const block = raw.match(/export type TrajectoryContribution =[\s\S]*?\n\};/)?.[0] ?? ''
    expect(block, '未找到 TrajectoryContribution 联合声明').not.toBe('')
    const kinds = [...new Set([...block.matchAll(/kind: '([a-z-]+)'/g)].map((m) => m[1] as string))].sort()
    expect(kinds).toEqual([
      'assistant',
      'compaction',
      'node',
      'request-header',
      'session-end',
      'system-prompt',
      'tool',
      'turn-end',
    ])
  })

  it('TrajectorySnapshot 顶层成员集（轨迹快照契约）+ 会话视图节点 target=trajectory', () => {
    expect(interfaceMembers(raw, 'TrajectorySnapshot')).toEqual([
      'callSchemas',
      'eventLocations',
      'eventNodes',
      'partial',
      'requests',
      'runningCalls',
      'systemPrompts',
    ])
    expect(norm(raw)).toContain("readonly target: 'trajectory'")
  })
})

describe('pin ⑤-5 ui-theme（S2 §2.4：令牌供体——唯一 immediately 预取行）', () => {
  it('dsh.client：platform=web + inject 5 包 + immediately:true（stage-one 预取层，按上游声明序）', () => {
    const decl = dshClientDecl('profile', '@deepseek-ai/dsh-client-ui-theme')
    expect(decl['platform']).toBe('web')
    expect(decl['immediately']).toBe(true)
    expect(decl['inject']).toEqual([
      '@deepseek-ai/dsh-client-connection',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-renderer',
      '@deepseek-ai/dsh-client-ui-settings',
      '@deepseek-ai/dsh-api-remotes',
    ])
  })
})

describe('pin ⑤-6 ui-dockkit（S2 §2.5：零 cordis 静态库——非 boot 插件）', () => {
  it('无 dsh.client 声明 + 零运行时依赖（cordis peer 仅类型面；web 锚构建期静态消费）', () => {
    const pkg = upstreamPkg('web', '@deepseek-ai/dsh-client-ui-dockkit')
    expect(pkg['dsh']).toBeUndefined() // 非 boot 插件：不进 boot manifest 组合装载
    expect(pkg['dependencies']).toBeUndefined() // 零运行时依赖（静态库）
  })
})
