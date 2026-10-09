# D8 hero 面板 · 对照走查归档（残差清单 + 截图 + 建议）

> **走查项**：[proposal.md 差异清单 D8](../proposal.md)——hero 面板 = `HeroPanel/HeroEmpty`（零项目首启：价值一句话 + 添加项目 CTA + 鲸绘底）+ `HeroWorkspacePicker`（会话 hero 相位项目选择）；总纲底座冻结形态（本轮 17 轮未重裁）——**既有对照走查项**，不新增裁决。
> **对照基准**：纠正版原型 hero 相位（总纲冻结）——[`prototype/index.html`（156–190 行：conv-hero 问候 + 鲸绘底 + 输入卡 + conv-heropickers）](../prototype/index.html) + [`prototype/styles.css`（723–734 行）](../prototype/styles.css) + hero 项目菜单（app.js `hero-project-menu` 2341 行起）。
> **实现锚点**：[`apps/web/src/workbench/HeroPanel.tsx`](../../../../../apps/web/src/workbench/HeroPanel.tsx)（main keyed 'dswf-hero' 占用者）+ [`HeroEmpty.tsx`](../../../../../apps/web/src/workbench/HeroEmpty.tsx) + [`workbench.css`（14–80 行）](../../../../../apps/web/src/workbench/workbench.css) + [`apps/web/src/views/session/HeroWorkspacePicker.tsx`](../../../../../apps/web/src/views/session/HeroWorkspacePicker.tsx)（conversation.hero.workspace 影子占用者）。
> **截图**：[shots/proto-d8-hero-light.png](shots/proto-d8-hero-light.png) / [dark](shots/proto-d8-hero-dark.png) / [项目选择弹层](shots/proto-d8-hero-picker-menu.png)（原型目标形态）。

## 一、面映射（先对齐「哪面对哪面」）

| 原型面（总纲冻结） | 产品实现面 | 说明 |
|---|---|---|
| conv-hero：**新会话相位**问候语「探索未至之境」+ 预览版 pill + 鲸绘沉底 | 新会话 hero 相位 = **官方 ConversationRoot hero 承载**（产品零占用） | 官方壳面（对齐原生 dsh 族——D1–D4 同口径，记账） |
| 鲸绘底 `conv-hero-bg`（书海插画） | **HeroPanel/HeroEmpty**（零项目首启面板）沿用同构图：文本靠顶 + `whale-hero-bg.svg` 沉底（母版零改拷贝） | 产品 hero = **零项目首启语义**（价值一句话 + 添加项目 CTA）；原型 hero = **新会话问候语义**——两场景不同，构图语言同源（鲸绘沉底对偶） |
| conv-heropickers：hero-project-menu pill（项目选择）+ 模式 pill | **HeroWorkspacePicker**（官方 Menu 影子占用者，取代官方 WorkspacePicker 弹层） | 模式 pill 无产品对应面（范围外） |

## 二、残差清单

| # | 部位 | 原型（目标形态） | 实现（现状） | 判定 | 走查建议 |
|---|---|---|---|---|---|
| R1 | 构图总纲 | 问候语靠顶（top 14%）+ 鲸绘沉底 80% 高 + 输入卡浮于书海（styles.css 724/727） | 文本靠顶（`clamp(40px,12vh,128px)` 栈距 dsw-raw 刻度）+ 鲸绘沉底 + CTA（workbench.css 28–39） | **构图同构对齐**（文本靠顶 ↔ 插画沉底对偶） | 走查确认首启观感 |
| R2 | 鲸绘刻度 | `height: 80%` · opacity .88 · 遮罩渐隐 26% · 暗色 `brightness(1.35) saturate(.85)`（styles.css 727–729） | `height: 85%` · opacity .88 · 遮罩 26% · 暗色同值（workbench.css 62–80） | **几何残差一处**：插画高 85% ↔ 原型 80%（实现注释自称「原型刻度」与原型实值不符——5% 偏离） | 走查确认遮罩带内文本零遮挡（原型零遮挡构图）；如收口 = 改回 80%，一行 CSS |
| R3 | 问候文案 | 「探索未至之境」+「预览版」pill | 「以知识资产为核心的研发工作台」+ 副句「注册你的代码项目……」（HeroEmpty 26–29） | 文案面差——**场景语义不同**（新会话问候 ↔ 零项目引导），非同位对照 | 记账（两面映射见上表）；产品新会话问候归官方壳 |
| R4 | 添加项目 CTA | 无 CTA（添加入口 = 左栏「＋」/ hero 项目菜单） | 官方 Button primary + IconProjectAddOutlineRegular（fix-17 官方件；`data-dswf-cta` 锚） | 产品超集（UF-2 首用引导需求）；**官方件** | 记账（需求性超集非偏离） |
| R5 | 项目选择 pill | hero-project-menu = pill（📁 emoji + 项目名 + ▾）开弹层 | chip 触发器 = **官方 owner 侧渲染**（文案经 workspace.title 对齐项目名，fix-24②）；弹层 = 官方 Menu primitive（portal/selectedId/footer）+ 官方文件夹图标 | **实现官方件化优于原型 mock**——原型 📁/▾ 为静态 mock 占位（同 D30 口径族：emoji/字符钮非冻结形态主张） | 走查确认：hero 相位点项目 chip → 弹层 = 项目行（文件夹图标）+「添加项目…」footer + 选中态；空项目集 = 直达注册流 |
| R6 | 模式 pill | 「⚙ 标准模式」pill（原型示意 toast） | 无（产品无模式面） | 范围性缺席 | 记账（原型自注「示意」） |
| R7 | hero 相位切换 | 发消息后问候语/插画退场（data-phase 切换） | 官方壳承载；HeroPanel 让位语义 = 注册成功即永久让位（HeroEmpty 头注 Hard Rule） | 语义同构（相位让位） | 走查确认注册流后 hero 永不回潮 |

## 三、走查结论（归档口径）

- **主体对齐**：鲸绘构图（R1）+ 项目选择弹层语义（R5）+ 相位让位（R7）与总纲冻结形态同构；产品两面拆分（零项目面板 / 会话 hero 相位）在官方壳架构内成立。
- **唯一几何残差**：R2 插画高 85% ↔ 原型 80%（一行 CSS 量级，走查后定收不收）。
- **官方件优于 mock 的记账面**：R5 弹层（emoji mock ↔ 官方 Menu/图标）——与 D30「对齐原生 dsh」族同向，无需回退。

## 四、实机走查清单（SC-8 输入 · 待用户执行）

1. **零项目首启**（清空项目态或新 profile）：中区 = HeroPanel（价值一句话 + 添加项目 CTA + 鲸绘底）；文本块落在插画渐隐带内、零遮挡书本；点 CTA → 两段注册流。
2. **会话 hero 相位**（已有项目 → 新会话）：官方 hero 输入卡 + 项目 chip；点 chip → HeroWorkspacePicker 弹层（项目行 + 添加项目 footer + 选中高亮）；切换项目零报错。
3. 暗色主题复核：插画提亮去饱和（brightness 1.35 / saturate .85）观感与 [shots/proto-d8-hero-dark.png](shots/proto-d8-hero-dark.png) 同向。
