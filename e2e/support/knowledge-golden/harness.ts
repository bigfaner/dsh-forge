// forge:knowledge/* 五通道 golden 对照支撑件（knowledge-stage1-foundation——SC-8
// 「契约与响应形状零变化」的语料与通道分发面）。
// 录制时点 = 1.3（core 现役供数迁移前形态）：fixtures/<channel>.json × 5 已落盘；
// 1.7 A2 供数切换后对照载体 = knowledge-golden-plugin.test.ts（插件自持库供数 ↔
// fixture 逐通道结构等价比对）；core 供数装配面（mountGoldenSupply）已随 core 知识域
// 退役移除（1.8）——fixtures 为历史录制事实，source.provider 仍注 core。
// 通道分发镜像 apps/host/src/ipc/knowledge-rpc.ts 的注册行 1:1（browse/listEntries/
// entryDetail/heat/sessionRecall → 服务法调用同形）；通道响应载荷 = 通道 handler 的域
// 返回体（RpcResult 信封为全通道统一外层，不属域载荷，不录入）。
import { KNOWLEDGE_CHANNELS } from '../../../packages/contracts/src/channels.js'
import type { KnowledgeChannel } from '../../../packages/contracts/src/channels.js'
import type { BrowseKnowledgeService } from '../../../packages/plugins/knowledge/src/index.js'

/** golden 语料（六条目 / 三域 + 根域；全部显式 updated——录制/比对确定性口径） */
export interface GoldenCorpusEntry {
  relPath: string
  frontmatter: string
  body?: string
}

export const GOLDEN_CORPUS: readonly GoldenCorpusEntry[] = [
  {
    relPath: '前端/框架选型.md',
    frontmatter: [
      'title: 框架选型', 'id: kb-fe-001', 'status: confirmed',
      'summary: 前端框架选型基线', 'keywords: [react, frontend]',
      'updated: "2026-01-15T00:00:00.000Z"',
    ].join('\n'),
  },
  {
    relPath: '前端/样式令牌.md',
    frontmatter: 'id: kb-fe-002\nsummary: 设计令牌与主题联动\nkeywords: [css, frontend]\nupdated: "2026-01-20T00:00:00.000Z"',
  },
  {
    relPath: '后端/API规范.md',
    frontmatter: [
      'title: API 规范', 'id: kb-be-001', 'status: draft', 'authors: 平台组',
      'summary: 接口设计规范', 'keywords: [api, backend]',
      'updated: "2026-02-01T00:00:00.000Z"',
    ].join('\n'),
    body: '正文-接口细则',
  },
  { relPath: '后端/网关.md', frontmatter: 'id: kb-be-002\nsummary: API 网关路由规则\nkeywords: [api, backend]\nupdated: "2026-02-05T00:00:00.000Z"' },
  { relPath: '编程/java/并发手册.md', frontmatter: 'id: kb-java-001\nsummary: Java 并发实践\nkeywords: [java, concurrency]\nupdated: "2026-02-10T00:00:00.000Z"' },
  { relPath: '指南.md', frontmatter: 'id: kb-guide-001\nsummary: 新手指引\nkeywords: [guide]\nupdated: "2026-01-01T00:00:00.000Z"' },
]

/** 召回场景会话 id（sessionRecall/heat 典型载荷的确定性分组键） */
export const GOLDEN_SESSION_ID = 'golden-sess-1'

/** 通道典型请求载荷（entryId 经 title 确定性解析） */
export type GoldenChannelRequest = Record<string, unknown> & { projectId: string }

/** 通道分发（镜像 knowledge-rpc.ts 注册行 1:1——通道名 → 服务法调用同形） */
export async function invokeGoldenChannel(
  channel: KnowledgeChannel,
  service: BrowseKnowledgeService,
  request: GoldenChannelRequest,
): Promise<unknown> {
  switch (channel) {
    case KNOWLEDGE_CHANNELS.browse:
      return service.browse({ projectId: request.projectId as string })
    case KNOWLEDGE_CHANNELS.listEntries:
      return service.listEntries({
        projectId: request.projectId as string,
        ...(request.domainPrefix !== undefined ? { domainPrefix: request.domainPrefix as string } : {}),
      })
    case KNOWLEDGE_CHANNELS.entryDetail:
      return service.getEntryDetail({ projectId: request.projectId as string, entryId: request.entryId as number })
    case KNOWLEDGE_CHANNELS.heat:
      return service.heatByEntry(request.projectId as string)
    case KNOWLEDGE_CHANNELS.sessionRecall:
      return service.sessionRecall({ projectId: request.projectId as string, sessionId: request.sessionId as string })
  }
}
