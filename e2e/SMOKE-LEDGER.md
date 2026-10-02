# smoke-ui 断言迁移台账（2.14 起步）

> 断言资产源：`docs/proposals/dsh-forge-redesign/prototype/smoke-ui.cjs`（重构原型 UI 冒烟）。
> 迁移载体：Playwright `_electron` e2e（`e2e/specs/smoke-skeleton.spec.ts`，G2 门 = `pnpm test:e2e`）。
> 权威行：tech-design Testing Strategy（apps/web e2e 行：smoke-ui 196 骨架组迁移 · 骨架组 100%）；
> PRD Goals（断言资产迁移：骨架组 100% 迁为 e2e 底稿，骨架组清单设计期清点）。

## 0. 口径与纪律

- **断言零删改**（任务 Hard Rule）：原断言文本/意图不变，仅载体与选择器适配；确需适配处在下表显式记录理由。e2e 用例以 `expect(…, '原断言（smoke 行号）')` 描述逐条可溯。
- **清点对账**：smoke-ui.cjs 实体 `T(` 断言调用 197 处 = **196 条 UI 断言 + 1 条运行时元断言**（L824「无页面 JS 错误」——harness 级，非 UI 面）。本台账以**行号**为主键（序号随段落编辑漂移，行号稳定）。
- **M0 语义内迁移**（任务 AC2）：知识视图 = 空态占位断言；同理，原型原型专属载体（`window.FORGE.db` 直查 / sessionStorage / toast / 原型本地目录）按 M0 产品语义适配，适配理由逐行记录。
- **条件留痕纪律**（沿 2.12 hero 组先例）：断言语义不弱化；M0 期实机数据面前置缺口（host `forge:projects/*` 通道未装配）以条件执行 + skip 留痕承载，转正条件见 §5。

## 1. 清点总览

| 类别 | 行数 | 处置 |
|---|---|---|
| 骨架组（M0，本任务迁移） | 37 | `smoke-skeleton.spec.ts` 三组用例承载（§2）；其中 3 行条件留痕（§5） |
| hero 底稿（原型行缺席） | — | 原型无零项目走查行；底稿 = UF-2 AC（§2 组三），条件留痕同上 |
| 运行时元断言 | 1 | L824 → 各用例 pageerror 面常驻（载体适配见 §2 末行） |
| 非骨架组（归类记账） | 159 | §3 按里程碑归属记账，待各组落地里程碑迁入 |

## 2. 骨架组逐条映射表（37 行 + hero 底稿 + 元断言）

### 组一：三区（smoke「三区布局(SC1)」段）

| 原断言（行号） | 原文 | e2e 载体（组一） | 适配记录 |
|---|---|---|---|
| L41 | 左栏渲染(纯菜单与导航) | `#root nav[aria-label]` 可见 + `[data-dswf-sidebar]` 可见 | 载体适配：M0 左栏 = 官方 sidebar 壳（路线 A）+ 产品工作区面板，非原型自绘纯菜单 |
| L42 | 左栏 = 品牌/新会话/知识库入口/项目树/设置 | `[data-dswf-nav="knowledge"]` 可见 + `.dswf-sidebar-sectionlabel`「项目」可见 | 载体适配：品牌/新会话/设置 = 官方壳承继域（官方 nav 在场断言承载）；知识库入口/项目树 = 产品面板 |
| L44 | 默认中区 = 会话视图(conv 可见 / knview 隐藏) | `.dswf-zones[data-dswf-view="session"]` + `.dswf-zone-knowledge` 隐藏；相位门 ∈ {hero, session} | M0 语义：hero = 首用替换呈现（UF-2），session = 会话视图；知识视图恒隐藏语义不变 |
| L45 | tabs = 对话/轨迹/知识召回 | `.dswf-session-panel [role="tab"]` 计 3 + 三 label 可见 | session 相位分支执行（hero 相位期会话面板不出场——替换呈现语义） |
| L46 | 右栏默认收起(轨道归零) | `[data-dswf-dock="collapsed"]` 在场 | 无适配 |

### 组一：视图互换（smoke SC5 段骨架行）

| 原断言（行号） | 原文 | e2e 载体（组一） | 适配记录 |
|---|---|---|---|
| L50 | 点「知识库」→ 中区切换为知识视图 | 点 `[data-dswf-nav="knowledge"]` → `[data-dswf-knowledge-m0]` 可见 + `data-dswf-view="knowledge"` | M0 语义：知识视图 = 空态占位断言（任务 AC2 既定口径） |
| L51 | 打开不占用右栏(dock 仍收起) | 知识模式下 `[data-dswf-dock="hidden"]` + 切回后恢复 `collapsed` | 载体适配：M0 将原型 `is-collapsed` 单类位细分为 collapsed（会话视图收起）/hidden（知识模式强制）两相位——「右栏不被占用」语义（轨道不可见）不变 |
| L52 | 右上角两个图标按钮已移除(知识模式无右栏入口) | `.dswf-zones-main` 内可见「展开」入口计数 = 0（负向） | 载体适配：原型钉两个具体图标钮；M0 钉可达面全集（角位钮/轨道钮均不在知识模式可达）——「知识模式无右栏入口」语义不变 |
| L59 | 会话视图可展开右栏 | session 相位点角位钮 `.dswf-workbench-docktoggle` → expanded；hero 相位桥派发（无角位钮） | 载体适配：原型 `#rb-corner-expand` → M0 会话区角位开关（同位语义） |
| L62 | 整体切换:进入知识模式 → 已开右栏也隐藏(内容让位) | `[data-dswf-dock="hidden"]` + tabpanel 仍挂载 | 无适配（keep-alive 常挂载为 M0 机制面） |
| L66 | 切回会话视图 → 右栏恢复展开(状态保留) | 桥派发 `show-session` → `data-dswf-view="session"` + dock expanded | 载体适配：原型点会话行；M0 无产品会话行期 = 工作台桥同径转移（转移表面同源 view-state 状态机） |
| L474 | 点会话行 → 中区切回会话视图 | 同 L66 载体（`show-session` 同径转移） | 载体适配：产品会话行实机驱动随项目/会话链路（host 通道装配后）转正；机制面（`sessionAnchorEvent` 官方锚跟随）单测 pin（2.12） |

### 组一：页签跟随（M0 最简集）

| 原断言（行号） | 原文 | e2e 载体（组一） | 适配记录 |
|---|---|---|---|
| L689 | 收起(轨道归零,同图标) | 角位钮再点 → collapsed + computed width 0px | 无适配（computed 样本入 L3 池）；按项目页签集切换（L719–L726）随域页签登记归 M2（§3） |

### 组二：向导两段走查（smoke「添加项目」段 ①–④ + ⑤ 条件）

| 原断言（行号） | 原文 | e2e 载体（组二） | 适配记录 |
|---|---|---|---|
| L753 | ① 先弹文件浏览器(选择工作区目录) | 左栏「＋」→ `.dswf-ap[data-dswf-ap="browser"]` + listbox | 载体适配：M0 = 单模态「添加项目」内嵌浏览器面（原型 = 独立对话框标题「选择工作区目录」）；入口 = 项目树「＋」（原型 `data-act=add-project` 同位语义），hero CTA 路径归组三 |
| L754 | ① 未选中时「选择此文件夹」禁用 | `.dswf-fb-confirm` disabled | 按钮文案 M0 段一 =「下一步」（段一口径），禁用语义不变 |
| L760 | ① 单击选中 → 按钮解禁 | 点 `dsh-demo` 行 → enabled | 夹具目录替原型本地目录（dsh-demo 名称保持） |
| L769 | ② 工作区目录自动回填表单 | `[data-dswf-rf-ws]` 值 + readonly | 无适配 |
| L770 | ② 项目名自动取文件夹名 | `[data-dswf-rf-name]` = `dsh-demo` | 无适配 |
| L771 | ② 任务清单与记录自动派生且只读(分隔符扁平化为 -) | `[data-dswf-rf-tasks]` = `~/.dsh-forge/<扁平化路径>` + readonly | 载体适配：M0 前缀 = 展示口径 `~/.dsh-forge`（真实 home 注入归配置面）；扁平化算法同口径（`Z:\a\b` → `Z-a-b`）整串断言 |
| L773 | ② 任务清单与记录位于表单最下方(目录字段之后) | 末 `.dswf-rf-row` 含 tasks 输入 | 无适配 |
| L777 | ② forge 目录(文档位置)按工作区构建预填 | `[data-dswf-rf-forge]` = `<ws>\.forge` | 无适配 |
| L778 | ② 知识库目录按工作区构建预填且可改 | `[data-dswf-rf-kn]` = `<ws>\.knowledge` + 非 readonly | 无适配 |
| L779 | ② forge 目录字段位于知识库目录之上 | `compareDocumentPosition` 序断言 | 无适配 |
| L783 | ② 目录字段均带「浏览…」(文件浏览器改选) | `浏览…` 按钮 × 2 | 无适配 |
| L784 | ② 文档位置 = forge 目录输入(仓内/仓外 radio 已并入) | radio 计 0 + 仓内 chip 可见 | 无适配 |
| L785 | ② 默认召回域字段已移除(默认加载改走 AGENTS.md · 提案记账) | 表单 input 全集 = 5（ws/name/forge/kn/tasks） | 载体适配：以字段全集盘点承载「无此字段」（M0 从未有该字段，负向盘点同语义） |
| L786 | ② 底部按钮 =「确认」 | `.dswf-rf-confirm` 文本 = 确认 | 无适配 |
| L791 | ③ 浏览 = 叠加文件浏览器(表单保持,共两层) | `[data-dswf-rf="browsing"][target=knowledgeDir]` + 标题「选择知识库目录」 | 载体适配：M0 = 模态内同位浏览面板（「返回表单」保留已填——表单状态保持语义不变）；原型 = 叠层两对话框 |
| L798 | ③ 浏览确认 → 回填知识库目录(叠层关闭,表单仍在) | 确认选 `.knowledge` → 回 form 相位 + kn 值更新 | 同上载体适配 |
| L803 | ④ 重新选择 → 回到文件浏览器 | 表单「重新选择」→ 同位浏览面板 `[data-dswf-rf="browsing"][target=workspace]`（标题「选择工作区目录」与原型对话框同文） | 载体适配：M0 = 表单内同位浏览面板（表单状态保持）；流程级「返回上一步」repick 相位同径 relink——换选联动语义不变 |
| L807 | ④ 换选工作区:回填 + 未手改字段重构(forge/项目名) | 换选 `legacy-app` → ws/forge/name 重构 | 无适配 |
| L810 | ④ 任务清单随工作区重新派生(扁平化) | tasks 值 = 新扁平化路径 | 无适配 |
| L811 | ④ 浏览选定的知识库目录保留(不随工作区重构) | kn 保持 `dsh-demo\.knowledge` | 无适配 |

### 组三（条件留痕）：⑤ 入库 + 已注册标记 + hero

| 原断言（行号） | 原文 | e2e 载体（组三） | 适配记录 |
|---|---|---|---|
| L814 | ⑤ 确认入库:forge / 知识目录按表单落位 | 确认 → executing → 成功反馈关闭 → 左栏项目树出现 `legacy-app` 行 | 载体适配：原型 `window.FORGE.db.projects` 直查 → M0 = RPC 注册链结果 + 左栏项目行（落位证据面）；前置 = host 通道（§5） |
| L820 | ⑤ toast:先 dsh create(幂等)后自家外键 + 任务清单落位 | `.dswf-ap[data-dswf-ap="success"]` 反馈面板 + 自动关闭 | 载体适配：原型 toast 文案 → M0 成功反馈面板（注册成功/挂接语义 + 自动关闭）；dsh create 幂等序 = core 四步链单测面（2.2）；前置 = host 通道（§5） |
| L766 | ① 已注册目录带标记(forge-plugin) | 注册后重开向导 → `legacy-app` 行 `data-registered` + 「已注册」chip | 载体适配：标记源 = `forge:projects/list` ws_path 全集（ownership 预检可视化语义不变）；组件级已绿（2.8 DirectoryBrowser 单测）；实机前置 = host 通道（§5） |
| —（原型行缺席） | hero 组 | UF-2 AC：首次启动(无项目) → 中区 hero；CTA → 打开 UF-3；注册成功即消退不残留 | 原型数据恒有项目、无零项目走查行（原型「hero」= 会话草稿相位，L377/L378 归 M7 联动组）；M0 hero 底稿以 UF-2 AC（prd-ui-functions Validation）为断言源——2.12 起步组吸收 |

### 运行时元断言

| 原断言（行号） | 原文 | e2e 载体 | 适配记录 |
|---|---|---|---|
| L824 | 无页面 JS 错误 | 各用例 `pageerror` 收集 = 空 | 载体适配：原型口径含 console error；M0 live console 含官方 `remote.mux` ws 重连失败噪音（官方层行为，2.14 探针实证 ×4）——断言面 = 未捕获异常 pageerror，console 全口径随 host ws 面治理后回归 |

### L3 布局对照断言起步池（样式纪律第 6 条；首批评左栏行/三区结构）

| 样本 | 断言 | 对照基准 |
|---|---|---|
| 三区结构 | `.dswf-zones` display=flex；结构位 = aside(rail)/main/main 内 aside(dock) | 原型三区结构基准 |
| 轨道归零 | 收起态 computed width=0px + visibility=hidden | 原型「轨道归零」同型（L46/L689 computed 载体） |
| 左栏行（官方比对） | 产品知识库入口行圆角 = 官方 nav 行圆角（实解析值比对，同 `--dsw-radius-md`） | **官方组件 computed style 抽样比对**（live 官方面） |
| 左栏行（刻度 pin） | 行高 34px（官方 ui-workspace projectRow 刻度）+ 字号 14px（官方刻度） | 官方行语言刻度（sidebar.css 形态纪律同源） |

扩池路径：知识卡片/详情抽屉样本随 M1 浏览面（3.6/3.7）入池。

## 3. 非骨架组归类记账（159 行）

> 按里程碑归属记账（PRD Out of Scope 口径）；各组落地时按本台账同形映射表迁入。

| 原型段落（行号区间） | 组名 | 归属 | 备注 |
|---|---|---|---|
| L43 | 知识库入口待审核徽标 | M4（审核工作台） | 入口徽标 = 审核队列计数面 |
| L52 区段内 L71 | 左栏知识库入口呈激活态 | M1（浏览面接线） | 激活态需视图态订阅面（M0 以中区 `data-dswf-view` 承载互换语义）；L475（取消激活）同记 |
| L72–L139 | 浏览面（范围选择器/搜索/域树/卡片/下钻/阈值） | M1（3.3/3.6） | 含 L99–L104 阈值行（置信度阈值过滤）→ M5 语义、随浏览面载体 M1 起步 M5 补全 |
| L145–L158 | 知识详情抽屉（打开/不占 dock/上下文保持/frontmatter/正文/Esc） | M1（3.7） | L153 四信号气泡 → M5（置信度四信号） |
| L160–L339 | 统计分析（时间过滤/下钻/自由分析/图表） | M7 | 整组 |
| L342–L356 | 详情摘要/两列布局/label 排版 | M1（3.7） | |
| L359–L363 | 元数据编辑对话框 + 保存回写 | M6 | |
| L366–L380 | @ 引用跳会话（当前/新会话 + 输入卡预填） | M7（知识 ↔ 会话联动） | 含 L377/L378「hero 草稿相位」（原型 hero = 会话草稿相位，非 UF-2 首用空态——见 §2 hero 组注记） |
| L383–L468 | 召回日志页签（轨迹行/动词过滤/详情/成因示例/迁移） | M7 | |
| L478–L490 | 会话知识召回 tab 内容（激活/统计头/列表/反馈/详情跳转） | M1（3.8 接线）/M7（反馈按钮完整形态） | M0 已有三 tab 占位（组一 L45）；tab 内容接线归 3.8 |
| L497–L536 | 会话演示（输入卡/工具行命中卡/发送召回/热度联动/即时入日志） | M7 + dogfood（4.2） | 发送链路 = dogfood 冒烟面（tech-design 会话链路行） |
| L548–L554 | 审核工作台（队列/合并） | M4 | |
| L560–L570 | 抽取（入口 chip/对话框/落库） | M4 | |
| L573–L592 | 晋升与移动（全局库/换域/重定向） | M6 | |
| L598–L605 | 开始页入口卡（知识库卡 → 中区/右栏让位/恢复） | M2（概览 + 域页签装配） | 互换语义已由骨架组 L50–L66 承载；入口卡面 = 开始页域内容 |
| L610–L616 | 项目概览（概要 + 对账卡/失配/找回） | M2（概览/对账卡完整 UI） | 对账服务面已就位（2.3 reconcileAtStartup） |
| L619–L672 | 任务三视图（列表/DAG/泳道/feature 绑定）+ 文档 tab | M2（任务域整体） | |
| L676 | chips ≥ 2（概览/文档） | M2（域页签登记） | M0 底稿 = 单页签「开始」在场（组一页签跟随节已断言）；「≥2」随域页签落位回归 |
| L679 | 关闭激活 tab | M2 | M0 页签集 = 全局常驻，无关闭面 |
| L682 | ＋ 重开开始页 | M2 | M0 页签常驻无需重开 |
| L685 | 全屏覆盖中区 | M2 | M0 = 轨道收展最简集 |
| L696–L716 | dock 知识文档页签（在 dock 打开/kndoc 面） | M1（浏览 + dock 登记） | |
| L719–L726 | 切项目 → 页签集切换/恢复/＋常驻 | M2（域页签登记后实机驱动） | 机制面（`visibleDockTabs`/`resolveActiveDockTab`）M0 已 pin（2.5 zones 单测）；实机驱动需域页签 + 项目锚 |
| L733–L739 | 模拟 +90 天 → 置信衰减 | M5（单元级） | 载体 = 原型 sim 工具；产品语义归 M5 时间衰减 |
| L742–L745 | 外部改动 → 对账横幅/重建索引 | M6（对账 UI） | 载体 = 原型 demo 工具 |
| L748 | 暗色主题切换 | 官方域（不迁移） | 样式纪律第 5 条：主题随官方令牌自动联动，产品无自持开关（原型工具行记账） |

## 4. 吸收记录（2.12 → 2.14）

`workbench-sc1.spec.ts`（2.12 SC1 起步组）全部行吸收进组一/组三：boot 就绪链与工作台桥发布（helpers + 组一）、三区/相位/tab/官方会话面锚（组一）、视图互换与 dock 相位组（组一）、hero 组（组三，条件留痕升级为独立用例）。文件已删除，行号映射以本表为准。

## 5. 前置缺口与转正条件（条件留痕行）

| 缺口 | 影响行 | 转正条件 |
|---|---|---|
| host 侧 `forge:projects/*` 通道未装配（`apps/host/src/main.ts` 未接 `registerProjectsChannels` + profile `dsh-forge-core` 行 `disabled: true`——2.12 实证，2.14 复核仍在） | hero 组（UF-2 AC）、L814、L820、L766 实机面；L474 产品会话行载体 | host 集成任务：core 插件 bundle 进 profile（vendored 四步链）+ `bootDshHost` 面世 `ctx.forgeProjects` + main.ts 接线——落位后组三自动转正执行（skip 门 = 相位 ≠ hero） |
| 官方 `remote.mux` ws 重连 console 噪音 | L824 console 全口径 | host ws 面治理后恢复原型全口径（pageerror + console error） |

## 6. G2 门接入

- 入口 = `pnpm test:e2e`（`e2e/playwright.config.ts`，globalSetup 前置构建 apps/web dist——幂等重跑）。
- 骨架组套件 = `e2e/specs/smoke-skeleton.spec.ts`（三用例：组一/组二实机全绿 + 组三条件留痕 skip）；重复跑验证记录见任务 2.14 执行记录。
