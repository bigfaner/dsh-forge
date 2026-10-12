# prompt/

定位：**业务** —— `forge:pipeline` 系统提示段渲染（`ctx.systemPrompt.section`，升序拼接）。

3.2 已填充：`index.ts` —— `renderForgePipelineSection`（老 forge hook 注入文本平移：状态层说明/执行协议/受限面声明 + 文档风格公约；`<forge-pipeline>` 包裹标签 = contracts `XML_TAGS` 单源；**不含 tool 说明**——dsh tool 注册面自带；段名 `forge:pipeline` / order 510）。1.16 起 `vars.forgeDir` 程序化注入（中央 projects.forge_dir——调用点插件装配径解析绑定项目实际值重注册升级）：注入时段内给绝对路径 + docs/{proposals,features,probes} 目录树；缺省/空白 = 整段省略（回退不炸渲染）。
