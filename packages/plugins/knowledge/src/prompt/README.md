# prompt/

定位：**业务** —— `forge:knowledge` 系统提示词两段函数化（stage③ C2 / 提案 §2.2 + §7 审核稿）。

- 静态瘦身段 `forge:knowledge`（order 910）：`renderKnowledgeStaticSection`——XML 标签制固定文本：检索方法段（search 严苛匹配口径 / domain_prefix 收窄 + knowledge_browse 指认 / 摘要先行 + 零命中改写）+ 中文归档规则块；写入面零工具说明（renderToolUsage 退役，工具加载由 dsh 机械承载）。
- 动态域索引段 `forge:knowledge-domains`（order 911）：`renderKnowledgeDomainsSection`——目录树形态：顶域主行 `路径(N 篇) — 简介` + 子域缩进行（├─/└─），简介缺席降级 `<无简介>`；双限截断（单顶域 6 行 / 总量 28 行）+ 计数行。
- 两段经 scoped 注册缝随会话绑定注入（`service/session-prompt.ts`——session-bind 时刻注册、闭包捕获 ws_path、未绑定不注册、同生同退空返 `''`）。
