// G1 pin ⑤（S2 清单处置）：官方 ui-* props——逐项入池或显式记残留（任务 2.13 AC3；
// 残留清单已于任务 3.9 收口，见下方「3.9 收口」台账）。
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
// ── 3.9 收口（Open Question ① 全量处置记录：入池 / 显式豁免及理由）───────────────
// R1 → 入池（⑤-7）：四包 apply 级运行期 inject 数组——lib/client.js 保留源注释
//      「Services required by … plugin」与 `inject = [...]` 字面量（稳定锚；S2 期
//      「无随包分发稳定文本锚」判定修正）；含 dsh.client 包级清单（⑤-2~⑤-5）未见的
//      运行期服务名（remote / remote.session / sidebarRight / configForms）。
// R2 → 入池（⑤-8）：uiConversation 快照通道类型面——assembly.d.ts（ConversationBinding
//      4 成员 + UiConversation extends Service + binding 签名）+ index.d.ts（Context 双属性行
//      conversation + uiConversation——S2 §2.2「ctx.uiConversation」单属性表述修正）+
//      ConversationViewSnapshotMap chat/trajectory 行 + ChatSnapshot 成员集（S2 期
//      「运行期服务面、无随包 types」判定修正——types 实随包分发）。
// R3 → 显式豁免：ui-theme 8 张样式表清单枚举 = 插件内部配置（e2e 已断言
//      style[data-plugin] 激活面，S2 §1）；逐张枚举 pin 属内部实现细节（Hard Rule 防脆断）。
// R4 → 显式豁免：ConversationTimelineSnapshot / ConversationTurnDataMap 深层 wire 形状——
//      2.11 终裁形态 (a)（自有 views/session 三 tab 组装，数据源 = forge:knowledge/* RPC），
//      P1 无逐行轨迹渲染消费方；轨迹级契约已由 ⑤-4（TrajectorySnapshot/贡献 8 类）入池。
// R5 → 显式豁免：HMR 全图 sync = client-hmr 置停（profile cordis.patch.yml disabled——产品
//      组合静态，P1 无热替换面，重启/刷新即重掌舵）；locale 面细节（LocaleNamespaceMap 扩展
//      等）2.x 视图任务未消费，随需入池（S2 §4#3/#4 处置维持）。
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

// ── 3.9 M1 批：R1/R2 收口入池（处置台账见文件头）──────────────────────────────

/** 提取 client bundle 内全部 `inject = [...]` 数组字面量（apply 级运行期依赖清单） */
function bundleInjectArrays(name: string): string[][] {
  const text = readUpstream('profile', name, 'lib/client.js')
  return [...text.matchAll(/inject = \[\s*((?:"[^"]+"\s*,?\s*)*)\]/g)].map((m) =>
    [...(m[1] ?? '').matchAll(/"([^"]+)"/g)].map((x) => x[1] as string),
  )
}

/** 提取 interface 成员名集合（属性 + 方法 + 泛型方法行——interfaceMembers 的方法面本地扩展） */
function faceMembers(rawTypes: string, interfaceName: string): string[] {
  const block = rawTypes.match(new RegExp(`export interface ${interfaceName} \\{\\n([\\s\\S]*?)\\n\\}`))?.[1]
  expect(block, `d.ts 未找到 export interface ${interfaceName}`).toBeTruthy()
  const members = new Set<string>()
  for (const line of (block ?? '').split('\n')) {
    const m = line.match(/^ {4}(?:readonly )?([A-Za-z_$][\w$]*)\??\s*[(:<]/)
    if (m) members.add(m[1] as string)
  }
  return [...members].sort()
}

/** ConversationViewSnapshotMap 模块增强块内验行（块内 JSDoc 行不受影响——按原始文本提取） */
function snapshotMapRow(rawTypes: string, row: string): boolean {
  // 基声明（ui-conversation 自有 contract）为空块且闭括无缩进；增强块闭括 4 空格缩进——二分锚定
  const block = rawTypes.match(/interface ConversationViewSnapshotMap \{([\s\S]*?)\n    \}/)?.[1]
  return block !== undefined && block.includes(`${row};`)
}

describe('pin ⑤-7 R1 收口：apply 级运行期 inject 数组（bundle 注释锚「Services required by」）', () => {
  it('ui-chat：10 服务（dsh.client 包级 11 包之外——运行期服务名含 remote.session / sidebarRight）', () => {
    expect(bundleInjectArrays('@deepseek-ai/dsh-client-ui-chat')).toContainEqual([
      'slots',
      'sessions',
      'uiWorkspace',
      'uiSession',
      'uiConversation',
      'locale',
      'configForms',
      'remote',
      'remote.session',
      'sidebarRight',
    ])
  })

  it('ui-conversation：7 服务（S2 §2.2 服务注入面原清单）', () => {
    expect(bundleInjectArrays('@deepseek-ai/dsh-client-ui-conversation')).toContainEqual([
      'slots',
      'sessions',
      'fileUpload',
      'uiSession',
      'uiWorkspace',
      'locale',
      'configForms',
    ])
  })

  it('ui-trajectory：5 服务（无自有服务，仅官方注入面）', () => {
    expect(bundleInjectArrays('@deepseek-ai/dsh-client-ui-trajectory')).toContainEqual([
      'slots',
      'sessions',
      'uiSession',
      'uiConversation',
      'locale',
    ])
  })

  it('ui-theme：4 服务（令牌供体的注册期依赖）', () => {
    expect(bundleInjectArrays('@deepseek-ai/dsh-client-ui-theme')).toContainEqual([
      'slots',
      'locale',
      'remote',
      'configForms',
    ])
  })
})

describe('pin ⑤-8 R2 收口：uiConversation 快照通道类型面（binding().target() 数据源契约）', () => {
  const assembly = readUpstream('profile', '@deepseek-ai/dsh-client-ui-conversation', 'lib/types/client/conversation/assembly.d.ts')
  const clientIndex = readUpstream('profile', '@deepseek-ai/dsh-client-ui-conversation', 'lib/types/client/index.d.ts')
  const chatSnapshot = readUpstream('profile', '@deepseek-ai/dsh-client-ui-chat', 'lib/types/client/contract/snapshot.d.ts')
  const trajectoryContract = readUpstream(
    'profile',
    '@deepseek-ai/dsh-client-ui-trajectory',
    'lib/types/client/trajectory-contract.d.ts',
  )

  it('ConversationBinding 成员集 = {snapshot, openTurn, activate, target}（会话绑定快照通道）', () => {
    expect(faceMembers(assembly, 'ConversationBinding')).toEqual(['activate', 'openTurn', 'snapshot', 'target'])
  })

  it('UiConversation extends Service + binding(source) 签名（root 服务官方注册径）', () => {
    const types = norm(assembly)
    expect(types).toContain('UiConversation extends Service')
    expect(types).toContain('binding(source: SessionBinding | SessionId): ConversationBinding')
  })

  it('Context 双属性行：conversation（动作面）+ uiConversation（装配面）——S2 单属性表述修正', () => {
    const types = norm(clientIndex)
    expect(types).toContain("conversation: import('./service.ts').IConversation;")
    expect(types).toContain("uiConversation: import('./conversation/assembly.ts').UiConversation;")
  })

  it('ConversationViewSnapshotMap 双行：chat: ChatSnapshot（ui-chat 扩展）+ trajectory: TrajectorySnapshot（ui-trajectory 扩展）', () => {
    // 增强块内含 JSDoc 行——按块提取后验行（norm 压缩会被注释残片干扰）
    expect(snapshotMapRow(chatSnapshot, 'chat: ChatSnapshot'), 'ui-chat 扩展 chat 行').toBe(true)
    expect(snapshotMapRow(trajectoryContract, 'trajectory: TrajectorySnapshot'), 'ui-trajectory 扩展 trajectory 行').toBe(true)
  })

  it('ChatSnapshot 成员集 = 6（order/nodes/locations/navigation/timeline/legacy——S2 §2.1 转录数据源）', () => {
    expect(interfaceMembers(chatSnapshot, 'ChatSnapshot')).toEqual([
      'legacy',
      'locations',
      'navigation',
      'nodes',
      'order',
      'timeline',
    ])
  })
})
