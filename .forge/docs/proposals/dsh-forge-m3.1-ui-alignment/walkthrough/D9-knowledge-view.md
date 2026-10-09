# D9 知识面板 · 对照走查归档（复核残差）

> **走查项**：[proposal.md 差异清单 D9](../proposal.md)——知识面板 = `KnowledgeView`：域轨 224 + 卡片网格 + 官方件工具栏 + EntryDrawer（dockkit 浮层）——**M3.8 已按总纲对齐，本走查为残差复核**；同构（总纲冻结形态）——对照走查项，残差走查归档驱动，不新增裁决。
> **对照基准**：纠正版原型 knview（总纲冻结）——[`prototype/index.html`（219–280 行：header + 内部页签 + 工具栏 + 左轨 + 卡片网格）](../prototype/index.html) + [`prototype/styles.css`（276–291、453–567 行）](../prototype/styles.css)。
> **实现锚点**：[`apps/web/src/views/knowledge/KnowledgeView.tsx`](../../../../../apps/web/src/views/knowledge/KnowledgeView.tsx)（浏览主体 + EntryDrawer 装配）+ [`knowledge.css`](../../../../../apps/web/src/views/knowledge/knowledge.css) + [`KnowledgeToolbar.tsx`](../../../../../apps/web/src/views/knowledge/KnowledgeToolbar.tsx) + [`EntryDrawer.tsx`](../../../../../apps/web/src/views/knowledge/EntryDrawer.tsx)。
> **截图**：[shots/proto-d9-knowledge-light.png](shots/proto-d9-knowledge-light.png) / [dark](shots/proto-d9-knowledge-dark.png)（原型目标形态；截图时种子 = 全部知识范围，23 域行 + 18 卡）。

## 一、残差复核清单

| # | 部位 | 原型（目标形态） | 实现（现状） | 判定 | 走查建议 |
|---|---|---|---|---|---|
| R1 | 布局骨架 | knview = header + 工具栏 +（左轨 \| 主区网格）；左轨 `.knview-rail`、检索宽 ≤460、网格 `auto-fill minmax(300px,1fr)` gap 10（styles.css 283/537） | `.dswf-kn-browse` 同构：左轨 **224px** / 检索 **460px** / 网格 `minmax(300px,1fr)`（knowledge.css 47/68/148，dsw-raw 豁免注记齐） | **结构刻度对齐**（M3.8 自证 + 本复核图纸一致） | 走查量取：域轨宽 / 网格列宽 / 检索框宽 |
| R2 | 域轨（目录即域） | `.kb-dom` 树 ≤3 层 + 「全部域」行 + 行计数 + 可折叠头（index.html 258–264） | DomainTree 常展开 ≤3 层 + 计数（行高 24 / 行内缩进 13px 每层——dsw-raw） | **对齐** | 走查确认层级缩进与计数 |
| R3 | 内部页签 | knview 三页签：**浏览 \| 统计分析 \| 召回日志**（index.html 237–241） | **浏览面 only**（统计分析 / 召回日志未实现——里程碑范围外） | **范围性残差**（结构缺席非样式偏离） | 记账待后续里程碑；SC-8 走查按浏览面打勾 |
| R4 | 工具栏 | 检索 + 状态过滤 chips（全部/待审核/已审核）+「仅看召回」chip +「✎ 从会话抽取」钮（app.js 329–336） | 范围 Pill（项目切换官方 Menu，fix-bug）+ 官方 Input 检索（Esc 清空 = 原型 kb-clear 交互同语义） | **件面优于原型**（官方件复用）；状态过滤 / 抽取入口 = 范围性缺席（审核面未入产品） | 走查确认检索/范围切换；过滤 chips 记账 |
| R5 | 会话下钻 | 项目范围下 `.kb-drill`「按会话下钻」块（index.html 265） | 无（P1 范围 = 项目级锚定，PRD UF-6 Notes 明示后置） | **范围性残差**（已注记的范围决策） | 记账 |
| R6 | 左轨注脚 | `.kb-foot`「项目知识目录 <路径> · 经宿主能力面写入」（app.js 363–368） | 无 | 与 **D26 零过程注释纪律**同向（原型注脚为机制说明 mock 面） | 维持实现；记账 |
| R7 | 卡片网格 | `.kb-grid` auto-fill minmax(300,1fr)；卡 = 标题/摘要/域/置信/热度 + 召回徽记 | KnowledgeCardGrid 同构（minmax(300,1fr)；卡字段投影 browse-model） | **对齐** | 走查确认卡字段与暗色行底 |
| R8 | 详情抽屉 | knDrawer 右侧滑入（mock） | EntryDrawer = **官方 dockkit 浮层形态**（对齐原生 dsh 族） | **件面优于原型**（官方浮层） | 走查确认开合/层级/Esc |
| R9 | 无锚空态 | 原型恒有种子数据（无空态面） | 引导空态 / 多项目「未锚定」说实话文案（KnowledgeView 40–51） | 实现超集（数据相位完备） | 记账 |

## 二、走查结论（归档口径）

- **M3.8 对齐结论复核成立**：布局刻度（R1/R2/R7）逐值与原型图纸一致（dsw-raw 豁免注记在案）；无样式性残差需要本轮收口。
- **范围性残差三项**（R3 统计分析/召回日志页签、R4 状态过滤/抽取、R5 会话下钻）= 功能范围决策（PRD Notes / 里程碑切分），非 UI 债——**记账不收口**。
- **件面两处优于原型 mock**（R4 官方 Input/Menu、R8 dockkit 浮层）——「对齐原生 dsh」族记账，无需回退原型自绘形态。

## 三、实机走查清单（SC-8 输入 · 待用户执行）

1. 左栏「知识库」行 → 中区知识面板：工具栏（项目范围 Pill + 检索）+ 域轨（224px、≤3 层、计数）+ 卡片网格（多列自适应）。
2. 点卡片 → EntryDrawer 浮层开（Esc/✕ 关）；检索关键词 → 命中过滤；Esc → 清空（原型 kb-clear 语义）。
3. 多项目台账下点范围 Pill → 项目切换菜单（文件夹图标行 + 选中态）。
4. 亮/暗双主题对照 [shots/proto-d9-knowledge-light.png](shots/proto-d9-knowledge-light.png) / [dark](shots/proto-d9-knowledge-dark.png) 逐项过 R1/R2/R7。
