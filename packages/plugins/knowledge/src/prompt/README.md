# prompt/

定位：**业务** —— `forge:knowledge` 系统提示词知识段渲染（`ctx.systemPrompt.section`，升序拼接）。

3.4 已填充：`index.ts` —— `renderKnowledgeSection`（契约内容源渲染：工具名/描述/参数说明机械取自 tools/ 定义对象，域层级上限等契约事实取自 @dsh-forge/contracts 常量；段名 `forge:knowledge` / order 500）。
