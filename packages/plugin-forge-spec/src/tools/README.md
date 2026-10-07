# tools/

定位：**业务** —— M3 spec 三动词 tool 定义与参数 schema（消费 `ctx.forgeFeatures` / `ctx.forgeTasks` 服务；plugin-forge tools 同型）。

3.1 已填充：
- `args.ts` —— 参数防御收窄共享原语（执行点自证：string 族 + 受控词表——本插件三 tool 参数全为 string）
- `session.ts` —— 会话上下文解析（exec → sessionId/cwd）+ cwd → projectId 绑定表解析器（bindingsFile 数据缝消费端）+ `WorkspaceNotRegisteredError`（ERR_WORKSPACE_NOT_REGISTERED；三动词均不落会话键——无 requireSessionId）
- `register-feature.ts` —— 显式补链正门（NULL 边界提案先 setProposalMode 后补链 / 已 accepted 提案升级远征；成链内聚径不重复调用）
- `upsert-feature-doc.ts` —— feature_documents upsert（登记即推进·单调只进；审计伴随经服务闭包）
- `validate-feature-tasks.ts` —— 单 feature 容器五类 + M3 扩展项只读校验（渲染 ✓/✗ 逐项双友好——✗ 含任务键）
- `index.ts` —— 三 tool 组装 + `FORGE_SPEC_TOOL_NAMES` 注册面全集（5.1 pin #18「两包 tool 面分置」锚：三在场 / transitionFeature 缺席——人类纠偏面）
