# tools/

定位：**业务** —— `knowledge_search` / `knowledge_read_abstract` / `knowledge_write` / `knowledge_read` 四 tool 定义与参数 schema（消费自有 `knowledge` 服务）。

- `faces.ts` —— 结构化最小面（对 dsh tools/systemPrompt 服务与 tool 定义形状的锚定；插件零 dsh 运行时包依赖）
- `session.ts` —— 会话上下文解析（exec → sessionId/cwd，官方 sessionCwd 同型）+ cwd → projectId 绑定表解析器（插件 config 装配缝）
- `search.ts` / `read-abstract.ts` —— 检索双 tool（参数与 KnowledgeService 同构，去会话解析双键；返回 = DTO 透传）
- `write.ts` / `read.ts` —— stage② 写门双 tool（§2.3/§2.4）：write = 必要性三问 agent 自判闸（平铺 `necessity.*` 三布尔）+ 严契约三拒收回执面；read = 全文读取准入三分支（confirmed 全开 / unconfirmed 拒且不露存在性 / superseded 曾审可读）
