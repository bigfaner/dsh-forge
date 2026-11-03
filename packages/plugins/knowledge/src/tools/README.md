# tools/

定位：**业务** —— `knowledge_search` / `knowledge_read_abstract` tool 定义与参数 schema（消费 `ctx.forgeKnowledge` 服务）。

3.4 已填充：
- `faces.ts` —— 结构化最小面（对 dsh tools/systemPrompt 服务与 tool 定义形状的锚定；插件零 dsh 运行时包依赖）
- `session.ts` —— 会话上下文解析（exec → sessionId/cwd，官方 sessionCwd 同型）+ cwd → projectId 绑定表解析器（插件 config 装配缝）
- `search.ts` / `read-abstract.ts` —— 两 tool 定义（参数与 KnowledgeService 同构，去会话解析双键；返回 = contracts DTO 透传）
