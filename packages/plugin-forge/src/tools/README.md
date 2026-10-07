# tools/

定位：**业务** —— M3 终态六动词 tool 定义与参数 schema（消费 `ctx.forgeTasks` / `ctx.forgeProposals` 服务；knowledge tools 同型）。3.5 切片 = 五 tool（`dispatchTask` 注册面收口归 3.4）；`claim-task.ts` 已退役删除（drift #1——并入 dispatchTask 复合动词，core 服务 API 保留）。

3.5 已收口：
- `faces.ts`（../faces.ts）—— 结构化最小面（对 dsh tools/systemPrompt 服务与 tool 定义形状的锚定；插件零 dsh 运行时包依赖）
- `args.ts` —— 参数防御收窄共享原语（执行点自证：词表/成对/分数/数组形状）
- `session.ts` —— 会话上下文解析（exec → sessionId/cwd）+ cwd → projectId 绑定表解析器（bindingsFile 数据缝消费端）+ `WorkspaceNotRegisteredError`（ERR_WORKSPACE_NOT_REGISTERED）
- `format.ts` —— tool 返回面双友好模板（裁决⑨）：`formatOk`（✓ 首行 + 键值行）/ `formatErr`（✗ code + 人话 + 违规清单逐行——typed 服务错误 → 失败 DTO，无 code 意外错误原样重抛 fail-loud）+ `callToolFace` 包装 + 输出 schema 失败支（`withFailureVariant`）
- `add-task.ts` / `submit-task.ts` / `query-task.ts` —— 任务域三动词（params snake_case；**容器直传**：`source_kind` + `source_slug` 平铺两显式参——feature_slug 垫片退役；任务定位 = `slug` + `local_id` 两显式参；gate/include/vars 嵌套负载平铺；addTask 增 `acceptance_criteria`）
- `create-proposal.ts` / `transition-proposal.ts` —— 提案域两动词（写动词 tool 专属；createProposal 增 `mode` 溯源透传 / transitionProposal 增 `superseded_by` 取代链透传——必带校验经服务 2.2）
- `index.ts` —— tool 组装 + `FORGE_TOOL_NAMES` 注册面全集（3.5 切片五在场；新面 pin = 5.1 #17/#18）
