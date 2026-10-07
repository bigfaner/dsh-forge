# prompt/

定位：**业务** —— `forge:spec` 系统提示段渲染（`ctx.systemPrompt.section`，升序拼接）。

3.1 已填充：`index.ts` —— `renderForgeSpecSection`（规格产出经 tool 读写状态层一段式：文档 → upsertFeatureDoc / 任务 → addTask + registerFeature / 诊断 → validateFeatureTasks；不携 XML 包裹标签——标签集四枚封闭不扩，knowledge 段同形；**不含 tool 参数说明**——dsh tool 注册面自带；段名 `forge:spec` / order 520[knowledge 500 → forge:pipeline 510 之后]）。
