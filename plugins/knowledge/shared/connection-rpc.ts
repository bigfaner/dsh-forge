// knowledge 域连接 RPC 双运输面共享锚（fix-9——bug 1c2a603e）：逻辑通道名 + 通道常量→
// endpoint 映射表单源（client 半 ui/rpc-channels.ts transport 消费；host 半
// host/connection-rpc.ts 分发消费——两半同表语义，漂移由 host 通道单测对账）。
// 官方契约核销（上游 dsh-client-connection rpc.d.ts）：channel 形态
// ^\/[A-Za-z0-9._~-]+$（'/knowledge' 合法）；endpoint 段 ^[A-Za-z0-9_$.-]+$——
// 点分族前缀（knowledge.* / projects.*）防方法键互撞且合法。

/** knowledge 域连接 RPC 逻辑通道（client rpc.call / host rpc.intercept 同源常量——官方共享 /api 通道） */
export const KNOWLEDGE_RPC_CHANNEL = '/api'

/**
 * forge:* 通道常量 → connection endpoint 映射表（键 = @dsh-forge/contracts 通道字面）。
 * knowledge 七通道（KNOWLEDGE_CHANNELS 全集）+ projects 两通道（knowledge UI 消费切片
 * list/get）。worktree.resolve 不入表——knowledge UI 零消费（anchored-projects 镜像
 * 窄面注记）；未映射通道 client 侧 typed 拒绝信封降级。
 * 承载缝 = 官方共享 /api 通道 interceptor（上游 rpc.d.ts HostConnectionRpc.intercept：
 * 「Intercept owned endpoints on the shared /api channel before its fallback」——官方
 * 留出的插件自有 endpoint 缝；endpoint 段官方校验 ^[A-Za-z0-9_$.-]+$，点分族前缀
 * knowledge.* / projects.* 防跨插件 endpoint 撞名且在官方校验集内）。
 */
export const CONNECTION_ENDPOINT_BY_CHANNEL: Readonly<Record<string, string>> = {
  'forge:knowledge/browse': 'knowledge.browse',
  'forge:knowledge/listEntries': 'knowledge.listEntries',
  'forge:knowledge/entryDetail': 'knowledge.entryDetail',
  'forge:knowledge/heat': 'knowledge.heat',
  'forge:knowledge/sessionRecall': 'knowledge.sessionRecall',
  'forge:knowledge/entryAction': 'knowledge.entryAction',
  'forge:knowledge/recallFeedback': 'knowledge.recallFeedback',
  'forge:projects/list': 'projects.list',
  'forge:projects/get': 'projects.get',
} as const
