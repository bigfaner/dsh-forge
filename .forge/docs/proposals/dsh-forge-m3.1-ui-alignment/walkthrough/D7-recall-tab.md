# D7 知识召回 tab · 对照走查归档（残差清单 + 截图 + 建议）

> **走查项**：[proposal.md 差异清单 D7](../proposal.md)——知识召回 tab，样式对齐原型卡语言（分组行 / 统计头 / verb 分色胶囊）——**对照走查项**（非重裁面，不新增裁决）。
> **对照基准**：纠正版原型 knrec 面（总纲底座冻结形态）——[`prototype/app.js` renderKnRec（1115–1174 行）](../prototype/app.js) + [`prototype/styles.css`（783–801 行）](../prototype/styles.css)。
> **实现锚点**：[`apps/web/src/views/session/RecallTab.tsx`](../../../../../apps/web/src/views/session/RecallTab.tsx)（RecallTabBody 243–299 / RecallRowView 162–222）+ [`apps/web/src/views/session/session.css`（22–213 行）](../../../../../apps/web/src/views/session/session.css)。
> **截图**：亮/暗双主题——[shots/proto-d7-recall-light.png](shots/proto-d7-recall-light.png) / [shots/proto-d7-recall-dark.png](shots/proto-d7-recall-dark.png)（原型目标形态；生成与验证见 [README](./README.md)）。

## 一、残差清单（原型 ↔ 实现 逐项对照）

| # | 部位 | 原型（目标形态） | 实现（现状） | 判定 | 走查建议 |
|---|---|---|---|---|---|
| R1 | 统计头 | **pill 胶囊 ×4**（召回 N 次 / 覆盖 N 条知识 / 显式反馈 N 条 / 会话沉淀 N 条；`knrec-stats` gap 8 wrap） | **纯文本行 ×2**（`召回次数 N · 覆盖知识 N`）+ 底部分隔线（session.css 33–46） | **形态残差**（胶囊 → 文本行）；后两项为数据面差（见 R6/R7） | 实机走查确认观感；若收口 = 统计头改 pill 胶囊形态（前两项），属样式对齐非新裁决 |
| R2 | 分组行（卡语言） | `.knrec-row` = 边框 l2 + `--r-card` 圆角 + bg-base（暗色 layer-1）+ hover 边框 l4 + 行距 8（styles.css 788–795） | `.dswf-recall-rowbtn` = 边框 l2 + radius-md + bg-base + hover 边框 l1 + bg-layer-2（session.css 67–89） | **卡语言已对齐**（边框浮卡在场）；hover 方向与暗色底取值就近映射 | 走查确认 hover/暗色行底观感与原型一致 |
| R3 | verb 胶囊 | `.knrec-verb` = h18 · r9 · code 10.5px · 单色底 interactive-bg-hover（styles.css 800）——**原型实物为单色**（非分色） | `.dswf-recall-verb` = padding 0 + radius-sm · 13px · 单色底 bg-layer-2（session.css 138–145） | **胶囊形态在场**；字号/圆角/底色取值就近映射 | **SPEC 记录**：D7 行文「verb 分色胶囊」与原型实物（单色）不符——走查按**原型实物口径**；若用户要分色 = 新裁决，本轮不新增（对照 D22 时间线「verb 分色」为另一面） |
| R4 | 行内徽章 | 标题行带 statusBadge + confBadge + heatBadge（app.js 1147） | 仅 HeatBadge（+ 失效行「索引未命中」标注，RecallTab.tsx 179/190） | **范围性缺席**：状态/置信徽章不在产品召回行数据投影（RecallGroup 契约无此二字段） | 记账；数据面扩项 = 新裁决，非本轮 |
| R5 | 域次行 | `.knrec-dom` = code 字体 11px 三级色，独行「域 · id」（app.js 1148） | `.dswf-recall-rowdomain` = 13px 三级色，行内拼标题后（RecallTab.tsx 176–178） | 小形态差（code 独行 ↔ 行内常规字） | 走查确认信息密度可读性；记账 |
| R6 | 反馈/采纳忽略 | 行尾「采纳 / 忽略」ghost 钮 + 「✓ 已采纳 / ✕ 已忽略」态（app.js 1140–1143） | 无（产品召回事件面无反馈动词） | **范围性缺席**（数据面差） | 记账；属知识内核反馈闭环后续里程碑 |
| R7 | 会话沉淀分组 | 第二分组「会话沉淀(抽取稿)」（app.js 1156–1168） | 无（本 tab = 召回使用事件单一数据源） | **范围性缺席**（数据面差） | 记账 |
| R8 | 行点击语义 | 标题行 cursor:pointer + 行尾「详情」钮双入口（app.js 1145/1152） | **整行 = `<button>`**（title「查看知识详情」→ onOpenEntry 跳知识详情抽屉；失效行降级 div 不可点，RecallTab.tsx 194–221） | **语义同构**；实现整行按钮可点击面更大（a11y 更优） | 记账（形态差非缺陷） |
| R9 | 标题/说明/底注 | `t-title`「知识召回」+ `t-aux` 机制说明段 + `knrec-note` 闭环底注（app.js 1124–1125/1172） | 零说明文案（统计头 + 行列表直入） | 实现符合 **D26 零过程注释纪律**；原型文案为总纲 mock 注释面 | 维持实现（纪律优先——原型此面为 mock 说明，非冻结形态主张） |
| R10 | 空态 | 「新会话暂无召回记录」`kb-empty`（app.js 1119） | EmptyState「本会话暂无召回记录」+ 鲸底让位构图（session.css 179–185） | **对齐**（文案同义；实现多插画让位一档） | 走查确认 |
| R11 | 装载/错误面 | 原型无（mock 即时渲染） | 骨架行 ×3 + 错误条 + 重试（fail-soft） | 实现超集（数据装载相位） | 记账 |

## 二、走查结论（归档口径）

- **卡语言主体已对齐**（R2/R3/R8/R10）：分组浮卡行 + verb 胶囊 + 热度徽章 + 点击跳详情抽屉语义同构——D7 行文点名的「分组行 / 统计头 / verb 胶囊」三件中，**分组行与 verb 胶囊在场**，统计头为文本行形态（R1，唯一样式性残差）。
- **范围性缺席四项**（R4/R6/R7 + R1 后两统计）均溯源数据面（RecallGroup 契约 / 反馈闭环未入产品），非样式债——**记账不收口**（收口即数据面扩项 = 新裁决，违反本任务「不新增裁决」边界）。
- **SPEC 勘误一条**（R3）：D7 行文「verb 分色」≠ 原型实物单色——SC-8 走查时请用户按原型实物口径打勾；如需分色另立裁决。

## 三、实机走查清单（SC-8 输入 · 待用户执行）

1. 选中一个发生过知识召回的会话 → 切「知识召回」tab：统计头两项数字与卡片行数如实；行 = 边框浮卡 + 标题 + 域 + verb 胶囊（`verb ×N`）+ 相对时间 + 热度徽章。
2. 点击命中行 → 就地打开知识详情抽屉（EntryDrawer）；失效行（若有）带「索引未命中」且不可点。
3. 新会话/无项目锚 → 「本会话暂无召回记录」空态（鲸底让位构图）；断网或停宿主 → 错误条 + 重试可用。
4. 亮/暗双主题对照 [shots/proto-d7-recall-light.png](shots/proto-d7-recall-light.png) / [dark](shots/proto-d7-recall-dark.png) 逐项过 R1–R3。
