# prompt/

定位：**业务** —— `forge:knowledge` 系统提示词两段函数化（stage③ C2 / 提案 §2.2 + §7 审核稿）。

- 静态瘦身段 `forge:knowledge`（order 910）：`renderKnowledgeStaticSection`——XML 标签制固定文本，零工具说明（renderToolUsage 退役，工具加载由 dsh 机械承载）。
- 动态域索引段 `forge:knowledge-domains`（order 911）：`renderKnowledgeDomainsSection`——行格式 `域名(N entries) — 简介`，简介缺席降级 `<无简介>`，>10 截断 + `… and N more domains (search with domain_prefix)` 计数枚举行。
- 两段经 scoped 注册缝随会话绑定注入（`service/session-prompt.ts`——session-bind 时刻注册、闭包捕获 ws_path、未绑定不注册、同生同退空返 `''`）。
