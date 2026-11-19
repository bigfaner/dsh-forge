# host/prompt —— Spec 系统提示词段（定位：业务）

`forge:pipeline` 系统提示段渲染与注册胶水（`ctx.systemPrompt.section`，升序拼接）。

- `index.ts` —— 唯一模式模板（主会话全文 / 子会话裁剪版两份自包含，Spec/Goal/AC 词汇，
  目录树 `.forge/specs/{slug}/`）；`presetBinding` 注入判据（缺省无条件注入 / forge 绑定
  会话预设命中才注入、未命中空串过滤——官方 dsh-system-prompt 对空串 section 整体过滤；
  会话预设 = 事件回放投影，出生头为基 + `agent-preset/selected` 覆盖）；`forge:doc-style`
  段直迁在位（渲染本体单源 = `@dsh-forge/lib-api/tools/doc-style`，此处 re-export + 注册）。
  段名 `forge:pipeline` / order 510（knowledge 500 之后）；`<forge-pipeline>` 包裹标签 =
  contracts `XML_TAGS` 单源；不含 tool 说明——dsh tool 注册面自带。
- `../index.ts` —— 注册胶水 `registerSpecPromptSections`（A1 自含形态：提示段注册恒在）。
- `forge:commander` 段不在本包（已在 `plugins/task-loop/host/prompt/commander.ts`）。

唯一模式：主/子会话两份自包含模板，Spec/Goal/AC 词汇，目录树 `.forge/specs/{slug}/`；
模式概念退役——本包零 `mode` 配置键、零双模板分流面。

注意：SystemPrompt 段文本默认插值——本段文本零 `{{` 引用（目录真值 = forgeDirs /
forgeResolvePath 工具查询，AGENTS 1.7）。
