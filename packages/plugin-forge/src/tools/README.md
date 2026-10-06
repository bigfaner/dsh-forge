# tools/

定位：**业务** —— Interface 8 六动词 tool 定义与参数 schema（消费 `ctx.forgeTasks` / `ctx.forgeProposals` 服务；knowledge tools 同型）。

3.2 已填充：
- `faces.ts`（../faces.ts）—— 结构化最小面（对 dsh tools/systemPrompt 服务与 tool 定义形状的锚定；插件零 dsh 运行时包依赖）
- `args.ts` —— 参数防御收窄共享原语（执行点自证：词表/成对/分数/数组形状）
- `session.ts` —— 会话上下文解析（exec → sessionId/cwd）+ cwd → projectId 绑定表解析器（bindingsFile 数据缝消费端）+ `WorkspaceNotRegisteredError`（ERR_WORKSPACE_NOT_REGISTERED）
- `add-task.ts` / `claim-task.ts` / `submit-task.ts` / `query-task.ts` —— 任务域四动词（params snake_case；任务定位 = `slug` + `local_id` 两显式参；gate/include/vars 嵌套负载平铺）
- `create-proposal.ts` / `transition-proposal.ts` —— 提案域两动词（写动词 tool 专属）
- `index.ts` —— 六 tool 组装 + `FORGE_TOOL_NAMES` 注册面全集（SC7/G1-11 pin 锚：六在场 / transitionTask·transitionFeature 两缺席）
