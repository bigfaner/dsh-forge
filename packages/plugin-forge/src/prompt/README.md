# prompt/

定位：**业务** —— `forge:pipeline` 系统提示段渲染（`ctx.systemPrompt.section`，升序拼接）。

3.2 已填充：`index.ts` —— `renderForgePipelineSection`（老 forge hook 注入文本平移：状态层说明/执行协议/受限面声明三部分；`<forge-pipeline>` 包裹标签 = contracts `XML_TAGS` 单源；**不含 tool 说明**——dsh tool 注册面自带；段名 `forge:pipeline` / order 510）。
