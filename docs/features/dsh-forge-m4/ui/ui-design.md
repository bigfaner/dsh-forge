---
created: "2026-09-24"
source: prd/prd-ui-functions.md
status: Draft
---

# UI Design: dsh-forge M4 — 项目中心工作台

> 层级:PRD(WHAT,`prd/prd-ui-functions.md` UF1-UF10)→ 本设计(HOW)。本文遵循 `DESIGN.md`(上游 ui-theme 提取的设计语言)与 `docs/conventions/ui-reuse.md`(上游复用纪律)。

## Design System

**来源:项目根 `DESIGN.md`(上游 `packages/client/ui-theme` 提取;权威优先级:上游源码 > DESIGN.md > 本文)**

### 色彩(一律语义别名,禁静态色阶;亮暗双主题自动切换)

| 用途 | 别名 | 亮 | 暗 |
|------|------|----|----|
| 页面底色 | `--dsw-alias-bg-base` | #FFFFFF | rgb(21,21,23) |
| 悬浮卡面 | `--dsw-alias-bg-layer-2` | #FFFFFF | rgb(44,44,46) |
| 主/次文字 | `--dsw-alias-label-primary` / `-secondary` | rgb(15,17,21) / rgb(97,102,107) | rgb(249,250,251) / rgb(207,211,214) |
| 链接/品牌动作 | `--dsw-alias-link` | rgb(65,118,230) | rgb(103,158,254) |
| 主按钮 | `--dsw-alias-button-primary-fill` + `-label-primary-foreground` | 黑底白字 | 白底黑字 |
| 边框 | `--dsw-alias-border-l1~l4` | 黑低透明 | 白低透明 |
| 状态 | `-state-error/success/warn-primary` | rgb(236,19,19) / rgb(34,197,94) / rgb(245,158,11) | — |
| 遮罩/toast | `-bg-mask-1` / `-toast-bg` | rgba(0,0,0,.24) / rgb(53,54,56) | — |

### 字体与字号阶

界面 `-apple-system…Microsoft YaHei`;代码 `'SF Mono'…PingFang SC`(不带裸 monospace 尾);字号阶 12/18(辅助)、14/22(正文)、16/24(标题),标题字重 500。

### 动效与几何

缓动 `cubic-bezier(0.4,0,0.2,1)`,时长 0.1/0.2/0.3s;Button 胶囊(md h36 r18 / sm h28 r14);Dialog r24 + mask + blur(2px);Menu 卡 r20 pad4;`corner-shape: superellipse(1.5)`(@supports 守卫)。

**M4 声明扩展(DESIGN.md 无先例;采纳前以本文为准,后续回写 DESIGN.md)**:内容卡 r12(C4 执行中卡、C6 元数据条——圆角层级介于控件 r14 与浮层容器 r24 之间);进度条端帽 r3(h6 之半,端部全圆观感);focus 可见环 2px(见「可访问性基线」);归档卡降透明 .6(弱化呈现而非禁用,介于 Button 禁用 .4 与全饱和之间);警示色底 6% 透明横幅(C2/C8 归档态,透明度层级对齐 interactive-bg-hover 惯例)。

### 组件复用先例(自研前核对)

上游 `ui-primitives`:Button / Modal / Toast / Menu / StateDot / Pill / HoverCard。M4 增强件优先仿其几何与令牌;会话列表/会话视图/workspace 切换 = 上游 client UI 族 100% 复用,forge 仅注入增强层。

### 可访问性基线(全组件适用)

- **键盘模型**:Tab/Shift+Tab 遍历交互件(卡片/列表行/按钮/分隔条);Enter/Space 激活(分隔条除外,见下);树/列表内 ↑/↓ 移动;Esc 关闭当前浮层或返回(见各组件 Interactions)。C9 分隔条 = 连续操作件(slider 语义,`role="separator"` + `aria-valuenow`=当前百分比):聚焦后 ←/→ 调比例 ±2%、Shift+←/→ ±10%、Home/End 复位 50/50,钳制同指针拖拽(30%–70%);Enter/Space 对分隔条无激活语义。
- **焦点管理**:C5 抽屉、C7 向导、C8 确认 Dialog 打开时焦点移入并圈闭(focus trap),关闭(Esc/关闭钮/完成)后焦点还原到触发元素;浮层语义 `role="dialog"` + `aria-modal`。
- **focus-visible**:全部交互件显示 2px 可见环(link 色,offset 2px;声明扩展,见「动效与几何」)。
- **对比度**:12/18 状态色小字(C7 行内错误文案、C8 状态/偏差文字、C4 次文字进度等)在亮暗双主题逐处验证对比度 ≥4.5:1(状态别名随主题切换取值);任一处不达标即改用「状态色 StateDot/图标 + label-primary 文字」组合,不以裸状态色小字交付。
- **非悬停路径健康**:StateDot 不裸靠颜色,一律伴随 12/18 文字状态词(正常/警示)或 `aria-label`;C1 项目卡聚焦即读出「代码区 正常 / 文件区 异常(<原因>)」,路径详情不依赖 hover。
- **异步播报**:toast 文案、C3 计数徽标变化、任务状态变更写入全局 `aria-live="polite"` 播报区;骨架容器标 `aria-busy`。
- **命中区**:交互件可命中区 ≥28×28(对齐 Dialog 关闭钮)。

### 文本溢出与规模基线

- 长字符串(项目名 / feature slug / 任务 title / subagent 名称=任务 id+title)单行省略号截断,不换行、不撑高固定行高(h64/h120/h40);完整内容经 hover/focus tooltip(HoverCard 先例)呈现;任务行内 key(等宽字体)完整保留,仅 title 截断。
- C4 任务面板 >50 行启用窗口化渲染(仅挂载可视区 ±10 行),≤500 任务规模滚动不卡顿;pane 拖拽边界见 C9。

## Navigation & View Keys(设计层定形)

**上游 SPA 无路由**(TECH-ui-reuse-002):导航经槽位注入(`main` keyed 槽 + `sidebar.panellist` list 槽),切换经 `ctx.layout.selectPanel`,选中态 = 共享控制器状态(会话期内存)。PRD 中 `/`、`/p/:id` 等为逻辑命名,本设计定形为视图键:

| 视图键 | 承载 | 槽位 | 迁移来源(M2/M3) |
|--------|------|------|------------------|
| `projects` | 项目列表(C1) | main(root scope) | workbench/overview(入口地位替代) |
| `project` | 项目工作台三区容器(C2,内含 C3/C4) | main(root scope) | workbench/tasks、workbench/features(收纳) |
| `project/settings` | 项目设置(C7/C8) | main(工作台二级) | M2/M3 设置面演进 |
| `settings` | 壳级设置(继承 M1,非 M4 新增面;PRD 主导航 #3) | main(root scope) | 既有 M1,键登记对齐 |
| 上游原生视图(会话等) | 代码区深链 | 上游 sidebar + `selectPanel` | 既有,不变 |

- 页内区切换(代码区 / forge 文件区 / 知识区扩展位)= 工作台页内 tab 状态,**不进全局视图键**;知识区扩展位 M4 仅在页内导航呈现禁用态说明(零空占位)。
- forge 文件区内部形态(feature 列表态 / feature 展开态 / 提案板态)= 该 pane 内状态,**不进全局视图键**;提案板 = M3 功能零缩水收纳,容器 = forge 文件区 pane(见 C4)。
- feature 选中态、任务详情开合 = 工作台内共享状态;注册向导 = `projects` 视图内对话框流(M2 向导演进)。
- sidebar 模型全视图统一:`sidebar.panellist` 注册「项目」(首项,M4)与「设置」(`settings`,M1 既有项);`projects` / `project` 两视图共享同一 panellist,无视图专属注入;项目名与切换入口唯一位于工作台头(C2),sidebar 不注入项目名区。
- 多窗口(C10)= 壳层窗口能力,不经视图键;拆出视图回主窗口按原键恢复。
- 孤儿视图清零:原 `workbench/*` 三键由上表替代,`settings`(M1 既有)同步登记,无游离键。

---

## Component C1: 项目列表视图(UF1)

### Placement

- **Mode**: new-page(新视图键 `projects`)
- **Target**: `projects`(main 槽根视图;应用启动默认落点)
- **Position**: main 槽全幅;sidebar.panellist 首项「项目」

### Layout Structure

```
projects 视图
├─ 视图头(h56):标题「项目」+ 搜索框(sm) + [新建项目] 主按钮(md)
├─ 活跃项目区:卡片网格(auto-fill, minmax(320px, 1fr), gap 16)
│   └─ 项目卡(h120):名称(16/24·500)/ 活跃 feature 行(14/22 次文字)
│       / 路径健康 StateDot ×2(代码区·文件区)/ 打开箭头
├─ 归档分区(默认折叠):折叠头(「已归档 N」次文字)+ 展开后同卡片网格(降透明 .6)
└─ 空态:居中插画位 + 「注册第一个项目」主按钮 → 注册向导(C7)
```

### States

| State | Visual | Behavior |
|-------|--------|----------|
| Default | 卡片网格 + 归档折叠 | hover 卡片浮起(bg-layer-2 + elevation 一档) |
| Loading | 骨架卡 ×6(占位灰块) | ≤2s 内完成 |
| Load-error | 列表区错误卡(错误说明 + [重试]) | 注册表读取失败;[重试] → Loading |
| Empty | 空态引导 | 仅「新建项目」一个动作 |
| Path-degraded | 卡片右上 StateDot 警示色 + 文字状态词 + tooltip 详情 | 点击卡片仍可进入(工作台内再提示) |
| Filtered-no-match | 活跃+归档均无匹配:列表区行内空态「无匹配项目」+ [清除] ghost | 清除过滤即回 Default |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| 点击卡片(活跃) | 进入 `project` 视图(选中项目写入共享态) | 视图切换 0.2s |
| 点击卡片(已归档) | 进入 `project` 视图·归档只读态(C2 Archived;PRD 只读 = 仅观察,恢复/删除走卡面按钮或 C8) | 视图切换 0.2s |
| [新建项目] | 打开注册向导对话框(C7) | Dialog r24 入场 |
| 搜索框输入 | 实时过滤活跃+归档卡片(项目名子串匹配,不区分大小写;客户端过滤,规模 ≤20 注册项目) | debounce 300ms;无匹配 → Filtered-no-match 态;命中项位于归档区时归档分区自动展开显示命中卡 |
| 归档分区展开/收起 | 切换折叠 | 0.2s 高度动画 |
| 归档卡 [恢复] | 项目移回活跃区 | toast 成功(Workspace 投影不变) |
| 归档卡 [删除] | 确认 Dialog(说明投影移除·会话退未分组) | 二次确认后执行 |

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| 项目卡 | name/archived/codeRoot/docRoot | 项目注册表(SQLite) |
| 活跃 feature 行 | 最新活跃 feature slug + 阶段 | feature_snapshot |
| 路径健康 StateDot | codeRoot/docRoot 探测结果 | 路径探测(缓存) |
| 归档计数 | archived 项目数 | 项目注册表 |
| 搜索框 | name 过滤串(本地内存,不落盘) | 客户端会话期状态 |

---

## Component C2: 项目工作台·三区容器(UF2)

### Placement

- **Mode**: new-page(新视图键 `project`)
- **Target**: `project`(main 槽)
- **Position**: 打开项目即达;三区 = 左栏全项目树 / 中间 dsh 会话面板 / 右栏 dockkit 页签容器。**布局线框权威 = `workbench-layout-v2.md`(v2.9 + 评审裁决 #15–#23,2026-09-25 原型验收)**,本节为定形摘要;原型 = `prototype/project-home.html`

### Layout Structure

```
project 视图
├─ 左栏(280 默认,264–420 可拖;收起 56 rail:◂/⊕/🔍/＋/⚙)
│   ├─ 品牌行(h60,整块 = 新会话快捷)+ 新会话独占行(h38 r12)+ 底部设置行(h42,⚙ + 连接 pill)
│   ├─ 区头三图标:🔍 搜索(原地展开)/ 视图选项(分组×排序菜单)/ 📁＋ 添加项目(folder-plus,原位确认卡 = C7)
│   ├─ 项目行:文件夹图标(闭/开;hover 换三角 caret,点击可展开任意项目)+ 名称 + hover ＋/⋯
│   └─ 会话行(h32 r12):状态点优先级 + 标题 + 相对时间;hover 时间位变 ⋯(重命名/分叉/归档);每组 5 条溢出折叠
├─ 中间会话面板(conv-root,背景 bg-base)
│   ├─ 76px header 单块:面包屑链(crumb max-width 220,逐 crumb 收缩省略,项目 crumb 常显)+ 动作簇(⟞task pill / 运行态 pill)+ utilities(📁▾ 在编辑器中打开:文件资源管理器/VS Code/IDEA/PyCharm)+ 面板钮 toggle;hero 相位整块隐藏 → 新会话右上角零图标
│   ├─ 「对话 / 轨迹」视图 tab(gap36 + 2px 底指示条);轨迹 = 工具栏 + 时间线 + 台账 + 详情面板(320–720 可拖)
│   ├─ 内容列 clamp(680–920) 居中可拖(下限 640,持久化);两侧 10px 拖柄
│   ├─ hero:🐋 + 「探索未至之境」;输入卡左上 项目▾ / 模式▾(固定四选:标准/PTC/极简/创建,联动 composer 工具钮)
│   └─ composer(r22):状态栏双 pill + 上下文环;运行中主钮 = 停止/排队发送
└─ 右栏 dockkit(默认收起 = 轨道归零;展开 45% 视口,300–70% 可拖,中央保底 400 不足归零;⛶ 全屏覆盖会话列)
    ├─ strip(h38 = 上边缘):chips(min80/max170/r12,名不虚化普通省略)+ ＋(紧贴最右 tab;无任何 tab 时隐藏)+ ⛶ + 面板钮(收起/展开同图标)
    ├─ 「开始」页:罗盘水印 + 三卡片(标题/说明两行,r24);卡片点击原位替换开始 tab;全部关闭 = 自动回开始页内容但无 chip
    ├─ 项目概览:标题栏 + 概要信息区(工作区/代码区/状态)+ 提案/feature/任务三子 tab
    ├─ 文档 tab:tab 名 = slug/产物名称(树内条目名);路径栏 h38 + ↻ + 只读正文
    └─ 依赖图:DAG(SVG 箭头连线 + 节点卡,blocker 在左)/ 泳道图(状态分组七态列)双模式分段钮;feature 名即下拉(仅本项目 + 状态徽标 pill)
```

- 归档横幅维持全宽警示态(见 States);布局记忆随项目,项目删除清除。
- 知识区 = 右栏面板注册制扩展位,M4 不渲染;SC2 断言口径不变(不渲染任何空 tab/空视图/预置数据)。

### States

| State | Visual | Behavior |
|-------|--------|----------|
| Default | 三区;中间会话视图(active 相位,头部图标齐全) | 已有消息的会话 |
| Hero(新会话) | 中间头部塌缩,右上角无任何图标;输入卡左上双选择器 | 未发送草稿(单例,不持久化) |
| Loading | 分区骨架屏 | ≤2s |
| Error | 区内错误卡(错误说明 + [重试] 主按钮) | 不白屏 |
| Archived | 工作台头下方全宽归档横幅(警示色底 6% 透明,声明扩展):「项目已归档(只读)」+ [恢复] ghost + [删除] ghost | 左栏树降透明;会话列表抑制;可用动作仅 恢复/删除(C8) |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| 左栏「新会话」 | 建草稿(单例;已存在时 no-op) | hero 相位 + toast |
| 会话行 hover ⋯ | 重命名 / 分叉(顶层副本)/ 归档(无确认,恢复走 C8) | 行即时更新/消失 |
| 区头 📁＋ | 原位「添加项目」确认卡(C7 预览行形态,不跳页) | Dialog r24 |
| 面板钮(strip 与会话头同图标) | 右栏收起 ↔ 展开(轨道 0 ↔ 记忆宽) | width 0.3s |
| ⛶ 全屏 | 覆盖会话列(conv 轨道让位,右栏 flex 撑满);再点退出 | 0.2s |
| ＋ | 直接(重)开「开始」页 tab(无菜单;无任何 tab 时隐藏) | chip 出现/激活 |
| 「开始」卡片 | 原位替换为 概览/终端/浏览器 对应面板 | chip 原位换名 |
| 📁▾(仅已发送会话) | 在编辑器中打开工作区菜单(4 项) | Menu r20 |
| hero 项目▾ / 模式▾ | 切项目(`?p=&new=1`,复用草稿单例)/ 模式四选(联动 composer) | Menu r20 |

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| 左栏树 / 视图选项 | 项目注册表 + dsh 会话 + localStorage(分组×排序) | 血缘索引 |
| 会话行状态点 / 相对时间 | 会话状态 + 更新时间 | dsh 会话列表 |
| 面包屑链 | 会话祖先链(含当前) | 血缘索引 |
| 右栏 tab 集 | 开始/概览/文档/依赖图 | 会话内 tab 模型 |
| 依赖图 | 任务 + deps(结构化解析)+ 会话运行态 | task_snapshot + session_links |
| worktree 状态条 | 代码区路径探测 + git 状态摘要 | 路径探测 |

---

## Component C3: 左栏项目树·会话列表增强(UF3)

### Placement

- **Mode**: existing-page(增强上游既有会话列表组件)
- **Target**: `project` 视图·左栏
- **Position**: 左栏「项目」区(dsw 行语言,2026-09-25 原型验收定形);**复用上游 workspace 会话列表组件**(过滤 = 该项目 workspace),forge 注入增强层

### Layout Structure

```
左栏列表区(dsw 行语言)
├─ 项目行(h34 r12):文件夹图标(闭/开两态;hover 换三角 caret,旋转 = 展开)
│   └─ hover 尾部:＋(在此新建会话)/ ⋯(重命名/删除项目)
├─ 会话行(h32 r12):状态点槽(优先级:待输入 > 运行中 > subagent 运行中;空闲无点)
│   ├─ 标题 + (有后代时)行尾 ▾ 展开后代 + 相对时间(12px 次级)
│   └─ hover:时间位变 ⋯ 会话菜单(✎ 重命名 / ⑂ 分叉会话 / 🗄 归档会话;源码三项逐字一致)
├─ subagent 行(h28,缩进 12/级,12px 等宽字):↳ 前缀 + 名称 + 状态点
├─ 溢出折叠行:每组 > 5 条 →「⋯ 展开其余 N 个会话 / 收起」
└─ 空白草稿行(新会话单例)置顶:时间位隐藏,hover ⋯ 照常
```

- **无计数徽标**(dsh 同构):运行中计数入 hover 卡(title 提示);状态点承载优先级语义。
- 视图选项(区头):分组(按项目树/按项目/单列表)× 排序(手动/最近更新),localStorage 持久化;单列表 = 全部会话平铺(新→旧,subagent 行首 ↳ 紧随其父)。
- 默认血缘后代收起;展开/收起与溢出状态进布局记忆;激活会话祖先链默认展开。
- 运行中判定(dsh 会话无终态信号,BIZ-004):后代「运行中」= 上游 AgentStatus=running;超 5 分钟无更新按非运行中呈现 —— 显示层时效衰减,静默降级 + 结构化 log(BIZ-resilience-001)。
- 血缘推断超时(>100ms)降级:仅呈现顶层会话行、不渲染后代层级 + 次文字说明;恢复后自动回完整模式。
- 归档项目:行降透明 + ⚠ 角标;已归档会话行消失(恢复走 C8「已归档会话」)。

### States

| State | Visual | Behavior |
|-------|--------|----------|
| Default(collapsed) | 分组会话行(状态点 + 相对时间) | 后代默认收起 |
| Expanded | 内嵌后代(递归收起,▸ 旋转 90°) | 0.2s |
| Overflow | 「⋯ 展开其余 N 个会话」 | 每组 > 5 |
| Empty | 「暂无会话,+ 新会话」引导 | 项目无会话 |
| Inference-degraded | 仅顶层行 + 降级说明文案 | 血缘 >100ms |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| 点击会话行 | 打开会话(工作台中间面板) | 行高亮 + 面包屑更新 |
| 点击行尾 ▾ | 展开/收起后代 | caret 旋转 |
| hover ⋯ | 重命名(prompt)/ 分叉(顶层副本,跳转)/ 归档(无确认,行消失 + toast) | Menu r20 |
| hover 项目行 caret | 展开/收起该项目会话(任意项目可展开,非当前示前 5 条) | 行级重渲染 |
| 点击 subagent 行 | 经 SubagentAddress 打开(含 C6) | 视图切换 |

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| 顶层条目 | 会话头(过滤 origin=subagent) | 上游会话列表 |
| 状态点 / hover 卡 | 会话状态 + 后代运行中计数 | 血缘索引 + 上游 AgentStatus(衰减规则见上) |
| 相对时间 | 会话更新时间 | 时间格式化(刚刚/N分钟/N天) |
| ⋯ 菜单 | 会话 mutator | 重命名/分叉/归档 |
| 收起/展开/溢出 | 布局记忆 | 随项目 |

---

## Component C4: forge 文件区·feature 视图(UF4)

### Placement

- **Mode**: existing-page(M3 feature 视图演进的收纳重组)
- **Target**: `project` 视图·forge 文件区 pane
- **Position**: pane 主体;feature 列表 → 单 feature 展开为默认呈现

### Layout Structure

```
forge 文件区
├─ 区头(h48):面包屑(随形态:列表态「forge 文件区」/ 展开态「forge 文件区 / <feature-slug>」/ 提案板态「forge 文件区 / 提案板」)+ [提案板] ghost + [管线] ghost(禁用,tooltip「M7」)
├─ feature 列表态(未选中 feature):列表行(h64:slug + 阶段 Pill + 进度「12/41」次文字)
└─ feature 展开态(选中):
    ├─ feature 头:slug(16/24)+ 阶段 Pill + 进度条(h6,r3,成功色)
    ├─ [阶段重点信息区](按阶段矩阵渲染,见下)
    └─ 任务面板(从属 feature):任务行列表(状态 StateDot + key + title + 挂接 Pill)
└─ 提案板态(pane 内形态,非视图键):M3 提案板完整功能面(提案列表/创建/状态流转)零缩水收纳
```

**阶段重点信息区(阶段矩阵 → 视觉)**:

| 阶段 | 重点信息区内容 |
|------|---------------|
| prd | 三件套完成度(3 × StateDot + 文档名);缺失项 ghost 按钮「补 /ui-design…」 |
| design | 设计文档状态行 + 评审状态 Pill;「去 /breakdown-tasks」ghost |
| tasks | 「41 任务 / 7 相位」摘要行 + 依赖健康 StateDot;「开工」主按钮 |
| in-progress | **执行中卡组**(见下)+ 进度「12/41」+ blocked/suspended 徽标行 |
| completed | 交付摘要行 + SC 完成度 Pill + 质量门 StateDot |

**执行中卡组**(in-progress 核心):卡片(bg-layer-2,r12,pad 12):任务 key+title(14/22·500)+ 运行 StateDot 呼吸 + 「查看会话 ⟂」链接色按钮;无执行中任务时该区不渲染(不空占位);未挂接的 in_progress 任务在任务面板行内呈现「未挂接会话」警示 Pill(sm)。

### States

| State | Visual | Behavior |
|-------|--------|----------|
| Default | 列表态或展开态(按选中) | 选中态共享(重进恢复) |
| Executing-focus | 执行中卡组置顶 | 卡片点击直达会话 |
| Loading | 行骨架 | ≤2s |
| Empty(feature 无) | 「创建第一个 feature」ghost 引导 | — |
| 提案板态 | M3 提案板完整功能面(面包屑「forge 文件区 / 提案板」) | pane 内形态切换,不经视图键 |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| 点击 feature 行 | 选中展开 | 0.2s |
| 点击执行中卡片 | 血缘推断 → 打开 subagent 会话(C6);未命中 → 顶层会话 | ≤1 跳 |
| 点击任务行 | 打开任务详情(C5,抽屉) | 抽屉滑入 0.3s |
| [提案板](切换钮,提案板态下再点即退出) | 同 pane 切入/退出提案板态(M3 收纳,功能零缩水) | 0.2s;面包屑「forge 文件区 / 提案板」⇄「forge 文件区」 |
| 面包屑「forge 文件区」段 / Esc | 回 feature 列表态(入口形态):展开态 = 取消选中 feature;提案板态 = 退出提案板 | 0.2s |
| 阶段引导按钮 | 对应技能发起链(M3) | 既有链路 |

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| feature 行/头 | slug/status/task_total/task_completed | feature_snapshot |
| 阶段重点信息 | 阶段矩阵(PRD 必答⑦) | feature_snapshot + manifest |
| 执行中卡组 | in_progress × active 挂接任务集 | task_snapshot + session_links |
| 未挂接 Pill | in_progress ∧ 无 active 挂接 | 同上 |
| 任务行 | key/title/status/挂接 | task_snapshot + session_links |
| 依赖健康 | 依赖校验结果 | 任务索引 |

任务/会话派生行的更新传播语义统一见「数据时效与更新传播」。

---

## Component C5: 任务详情·绑定会话面板(UF5)

### Placement

- **Mode**: existing-page(M2/M3 任务详情增强)
- **Target**: `project` 视图·forge 文件区(C4 内抽屉)
- **Position**: 右侧抽屉(w 400,自右滑入;窄屏(<1024)全宽)

### Layout Structure

```
任务详情抽屉
├─ 头:任务 key+title(16/24)+ 状态 Pill + 关闭钮 28×28 r8
├─ [既有区,M2/M3 保持]:描述原文 / 依赖链 / 执行记录(功能零缩水)
└─ [新增] 绑定会话区:
    ├─ 挂接历史列表(新→旧):行 = 会话标题 + active/ended Pill + 时间
    │   行展开(active 与 ended 行均可;ended 行展开 = 查看历史,PRD UF5):血缘后代列表(同 C3 展开态样式)→ subagent 条目(名称=任务 id+title;取数同血缘索引,ended 为历史快照)
    └─ 行尾 [打开] ghost(sm):顶层 → session-focus;subagent → SubagentAddress
```

### States

| State | Visual | Behavior |
|-------|--------|----------|
| Default | 既有区 + 绑定会话区(有挂接) | — |
| No-link | 「未挂接会话」+ [发起] 主按钮(sm) | 走 M3 发起链 |
| Inference-degraded | 仅顶层会话行,血缘位「不可用」次文字 | 可打开顶层 |
| Open-failed | toast 错误「会话不存在或已清理」 | 不静默 |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| 打开抽屉 | 渲染既有区 + 绑定区 | 滑入 0.3s |
| 展开 active/ended 行 | 血缘推断后代(active=当前树;ended=历史查看) | 0.2s |
| [打开] | 打开对应会话视图 | selectPanel/SubagentAddress |
| [发起] | M3 一键发起链 | 既有链路(prompt 全量注入) |

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| 挂接历史行 | session_id/status/started_at | session_links |
| 后代列表 | 血缘树(origin=subagent) | 血缘推断 |
| 发起 | 任务 prompt 注入 | M3 发起链(不变) |

---

## Component C6: subagent 会话·任务元数据条(UF6)

### Placement

- **Mode**: existing-page(上游会话视图注入增强)
- **Target**: 上游会话视图(subagent 实例)
- **Position**: 会话视图头部下方信息条(h40,全宽,uid 注入于 subagent 实例)

### Layout Structure

```
[上游会话视图头部——保持]
[增强] 任务元数据条:bg-layer-2,r12,h40,pad 0 12:左侧「⟂ task 2.1.3 — 实现会话列表增强 / in-progress」
(Pill 状态色)+ 右侧「查看任务」ghost(sm)
```

### States

| State | Visual | Behavior |
|-------|--------|----------|
| Bound | 元数据条全量 | 点击跳 C5 |
| Ambiguous | 「该会话执行中」(无任务号,次文字) | 多任务共会话降级 |
| Unbound | 不渲染 | 普通非任务 subagent |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| 点击元数据条/查看任务 | 打开任务详情(C5) | 抽屉 |
| 命名与血缘冲突 | 以血缘为准展示 | 静默矫正 |

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| 元数据 | task key/title/status/feature | 血缘推断 + task_snapshot |

---

## Component C7: 项目创建·文档位置(添加项目确认卡 / 项目设置;UF7)

### Placement

- **Mode**: existing-page(M2 注册向导演进;2026-09-26 重构为确认卡形态)
- **Target**: 原位确认卡(项目列表「新建项目」/ 空态引导 / 工作台左栏区头 ＋)+ `project/settings`「文档位置」节(事后迁移)
- **Position**: 上游裁决 = `docs/decisions/project-storage-and-knowledge.md` §5 v2(交互/校验权威);线框 = `workbench-layout-v2.md` §2.2 ＋ 行(裁决 #24)

### Layout Structure

```
添加项目确认卡(Dialog r24;全部只读 + 两处 ✎)
├─ 代码区(唯一输入位 *):路径输入(拖拽/粘贴/浏览;剥引号、拒绝裸盘符与相对路径)
│   └─ 侦测行(信息陈述,非错误码):✓ git 仓库 ·(检出 forge 文档树)/ 未检测到 git(应用管理,非错误)
│       / 已注册项目(禁用)/ 路径不存在(硬校验 = 存在+可读;可写性运行时复检)/ 父目录 → 子仓 chips
├─ 项目名:自动取文件夹名(✎ 可改;左栏 ⋯ 随时可改)
├─ 文档位置(预览行,r14 边框卡):
│   ├─ 预选三档(证据门控,换路径即重估,无跨项目黏性):
│   │   沿用仓内「<root>\docs · 已检出 forge 文档,沿用(随 git)」(命中时为默认)
│   │   仓内新建「<root>\docs · 随 git 提交,可 PR 评审」(有 .git;懒物化)
│   │   应用管理「应用数据目录(本机)· 应用管理 + 内部版本历史,不进 git」(无 .git 主路径)
│   └─ ✎ 展开(默认收起):单选 应用管理 / 仓内 + 路径框(默认 <root>\docs;沿用项仅命中时呈现)
├─ 过程留痕灰字(12px tertiary):「过程留痕 · 应用数据目录(本机,不进 git)」
├─ 高级折叠(details):自定义文档路径;仓外(⊄ 代码区)→ 显式授权行(BIZ-001/003 收窄至此)
└─ [取消(Esc)] [添加项目](主按钮;enabled = 存在 ∧ 未注册 ∧ 名称非空 ∧ 自定义已授权)
知识区:不上卡(不渲染,后续里程碑);场景演示 chips 不上产品 UI(原型移评审工具)
```

### States

| State | Visual | Behavior |
|-------|--------|----------|
| Default(证据预选) | 侦测陈述 + 预览行 | 预选只由本仓证据决定(git / forge 树 / 注册表) |
| Registered | 「已注册项目 — 同一代码根仅一个项目」+ 禁用 | 快车道 toast「已注册 · 打开」 |
| No-git | 「未检测到 git — 文档将由应用管理」(信息态,**非错误**) | 零 git 强制;仍可添加 |
| Missing | 「路径不存在」+ 禁用 | 硬校验 = 存在且为目录 + 可读 |
| Parent | 子仓 chips(直接子目录 ≥2 `.git`) | 点击 chip 一键选定 |
| Custom-outside | 授权行(仅高级折叠内) | 显式授权后解除禁用 |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| 给路径(拖/粘/浏览) | 侦测(固定前缀有界探测;禁 glob、不读正文) | 侦测行 + 预览行即时更新 |
| ✎ 文档位置 | 展开模式 + 路径编辑 | 0.2s;预览行随动 |
| 换路径 | 预选重估(手动选择清零、自定义清空、授权复位) | 无跨项目黏性(仓内落点永不继承) |
| [授权使用此位置] | 仓外自定义显式授权 + 复检 | 授权行转成功态;解除禁用 |
| [添加项目] | 写注册表 + 投影同步 + 快照就绪 | toast(含落位模式);原位生效不出页 |
| 设置页「文档位置」 | 双向迁移(迁入仓 / 迁回应用;应用管理形态带内部版本历史) | 一等动作;`.git` 后至触发一次性非模态迁入建议 |

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| 代码区路径 | anchor(身份与唯一性 = 三层比对,工程口径 decisions §5.5) | 侦测器 + 项目注册表 |
| 预选三档 | 证据(git / 仓内 forge 树特征 / 注册表) | 侦测器(D1 信号) |
| 自定义授权 | 授权位(BIZ-001/003) | 项目注册表 |
| 创建 | addProject(名称 / anchor / 文档位置) | 数据内核 |

---

## Component C8: 项目设置·投影与生命周期(UF8)

### Placement

- **Mode**: existing-page(设置页新节)
- **Target**: `project/settings`
- **Position**: 「三区位置」节(C7 复用)下方「投影与生命周期」节

### Layout Structure

```
设置页头(h56):[←] ghost 返回 + 「项目设置」标题
投影与生命周期
├─ 投影状态行:StateDot(healthy 成功色 / degraded 警示 / deviation 警示)+ 状态文案
│   └─ degraded:[重试投影] 主按钮(sm)
│       deviation:[偏差明细 N] ghost(sm,N=偏差条数,默认收起)→ 展开折叠列表:
│           逐行 = 类型 Pill(改名/删除/乱序)+ 条目名(次文字);尾部「处理建议」只读文字(无操作入口):
│           改名 →「下次对账按 dsh 侧新名重建索引」;删除 →「快照重建后不再呈现该条目」;乱序 →「按 dsh 侧实际顺序重排」——均不提供反向写回(禁反向写,BIZ-006)
└─ 生命周期动作行:[改名] ghost · [归档] ghost · 归档态时 [恢复] ghost + [删除] ghost(错误色文字)
    └─ 归档/删除确认 Dialog:归档说明「workspace 保留,会话仍按项目分组」;删除说明「投影移除,会话退未分组(历史不删除)」
```

### States

| State | Visual | Behavior |
|-------|--------|----------|
| Healthy | 成功 StateDot「与 dsh 侧一致」 | — |
| Degraded | 警示 + 重试 | 重试成功 → healthy |
| Deviation | 偏差明细折叠 | 仅提示,无反向写入口 |
| Archived | 归档态横幅(警示色底 6% 透明) | 恢复/删除可用 |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| [←] 返回 / Esc | 回 `project` 视图(入口页) | 视图切换 0.2s |
| [重试投影] | 重跑同步 | 成功 toast / 保留降级态 |
| [偏差明细 N] | 展开/收起偏差列表 | 0.2s 高度动画;展开态 Esc/再点收起 |
| [改名] | 行内编辑 + 确认 | 投影同步;失败降级不阻断本地生效 |
| [归档]/[删除] | 确认 Dialog(BIZ-006 语义文案) | 归档:留在设置页进入 Archived 态(工作台同步归 C2 Archived 只读);删除:主窗口返回 `projects` + toast,该项目全部拆出窗口关闭(C10) |

### Data Binding

| UI Element | Data Field | Source |
|------------|-----------|--------|
| 状态行 | 投影对账结果 | 投影状态 + 对账 |
| 偏差明细 | dsh 侧手改事实 | 对账(启动/刷新) |
| 生命周期 | 项目注册表 | 注册表 + 投影通道 |

---

## Component C9: 分屏布局(UF9)

### Placement

- **Mode**: existing-page(工作台布局层)
- **Target**: `project` 视图主内容区
- **Position**: 工作台头 [分屏] 控制;pane 作用于 C3/C4 视图实例

### Layout Structure

```
主内容区
├─ 单 pane(默认):活跃区全幅
└─ 分屏态:水平双 pane(分隔条 w6 可拖,hover 高亮);pane 头 h32(区名 + [拆出] ghost sm + [关闭] ghost sm)
    └─ pane 内容 = C3 或 C4 完整组件实例(同一组件,功能面不缩水)
```

- pane 组合任意(会话+任务面板典型);比例拖拽即存(布局记忆)。

### States / Interactions / Data Binding

| 维度 | 内容 |
|------|------|
| States | single(默认)/ split(双 pane,记忆比例)/ restored(重进恢复) |
| Interactions | [分屏]→添加 pane 并选视图(Menu);拖分隔条→比例即时存(钳制 30%–70%,两侧 pane 最小宽 30%);[关闭]→单 pane;全部 pane 关闭→回活跃区 |
| Data Binding | 布局树(pane 视图类型/比例/顺序)→ 布局记忆(随项目) |

---

## Component C10: 多窗口(UF10)

### Placement

- **Mode**: existing-page(壳层窗口能力;pane 操作入口)
- **Target**: 独立 Electron 窗口(自 `project` 视图 pane 拆出)
- **Position**: pane 头 [拆出为窗口];窗口内容 = 该 pane 视图完整实例

### Layout Structure

```
独立窗口:标准壳窗(继承 M1 窗口基座)——标题「<项目名> · <视图名>」
└─ 内容 = 拆出 pane 的视图实例(C3/C4);无工作台头(窗口标题替代),区导航不可用(单视图)
```

- 窗口集合(视图类型/尺寸/位置)随项目记忆;关闭主窗口 = 退出应用(单实例,M1 语义)。
- 拆出窗口**绑定来源项目**(窗口上下文 = 拆出时项目),不跟随主窗口激活指针:主窗口经项目切换 Menu 落到项目 B 后,A 的拆出窗口仍以 A 上下文渲染(A/B 并行观察)。BIZ-002 单激活指针仅约束主窗口工作台与启动落点;拆出窗口 = 派生快照的显示面,非第二激活。
- 来源项目生命周期:归档 → 其拆出窗口保持可用,窗口标题追加「已归档」;删除 → 该项目全部拆出窗口关闭 + toast 通知(布局记忆随删除清除)。
- 拆出窗口经 OS 标题栏关闭 = [收回] 同语义:pane 即时回主窗口原位,不待重启;首次拆出默认 960×640 居中于主窗,此后记忆用户尺寸/位置。

### States / Interactions / Data Binding

| 维度 | 内容 |
|------|------|
| States | single-window(默认)/ multi-window(并行)/ restored(重进恢复拆出态) |
| Interactions | [拆出为窗口]→建窗并移除主窗 pane;独立窗口 [收回]→回主窗 pane;拖尺寸/位置→记忆 |
| Data Binding | 窗口集合 → 布局记忆(随项目);单实例约束 → 壳层 |

---

## 数据时效与更新传播(BIZ-005)

- 任务/会话派生面(C3 计数徽标、C4 执行中卡组/任务行/进度、C5 绑定会话区)订阅 task_snapshot / session_links / 血缘索引的失效-重建事件,事件到达即重渲染;会话侧与终端侧(外部进程写 forge 文件)变更经文件监听触发快照重建,端到端**免手动刷新可见 ≤5s**。快照 = 派生缓存,可弃重建(BIZ-coexistence-002)。
- 重建期间保留上一份快照内容(不回退骨架屏),区域顶部 12/18 次文字「同步中」标注;重建失败按 BIZ-resilience-001 静默降级 + 结构化 log。
- 全设计不含视图级手动刷新按钮;唯一**投影**重试动作 = C8 [重试投影](重跑投影同步,非刷新视图)。区内错误恢复重试(C1/C2 错误卡 [重试],语义为重试当区数据装载)不属刷新,不受上句限制。
- 各组件 Loading 终态二选一:数据到位 → Default/Empty;装载失败 → 错误卡(C1/C2)或静默保留上次内容 + 结构化 log(其余派生面,优先 BIZ-resilience-001)。
- 首屏 ≤2s / 500 任务基线沿用各组件 States 表;一键发起到可交互 ≤3s(M3 链路,不变)。

## 页面总览(Page Composition 对应)

| 视图键/载体 | 组件 | 原型文件 |
|-------------|------|----------|
| `projects` | C1 | projects.html |
| `project` | C2+C3+C9(分屏演示) | project-home.html |
| `project`(forge 区展开) | C4+C5 | feature-view.html |
| `project`(forge 区·提案板态) | C4(提案板收纳) | feature-view.html(内嵌区块) |
| 上游会话视图(subagent) | C6 | session-view.html |
| 添加项目确认卡 | C7 | projects.html(新建项目)/ project-home.html(左栏 ＋ 原位卡) |
| `project/settings` | C7+C8 | settings.html |
| 独立窗口 | C10 | index.html 内说明 + 模拟 |

原型交付说明(管线):「原型文件」列**已交付并通过验收目验(2026-09-25)**——原型位于 `ui/prototype/`(导航页 `index.html`);共享数据层 data.js(sessionStorage 同标签页持久;未发送草稿不持久化)。布局线框权威 = `ui/workbench-layout-v2.md`(v2.9 + 评审裁决 #15–#24);截断省略、focus 可见环、钳制、状态色对比度等视觉断言已在原型上目验;Playwright 冒烟 **106 条全绿**(2026-09-26 添加项目确认卡重构后复跑,证据三档/黏性禁令/已注册/父目录 chips/授权收窄均有断言)。

## 与 PRD 的对账备忘(Step 10 输入)

- PRD Navigation 的 `/`、`/p/:projectId` 等路由命名 = 逻辑命名;设计层已定形视图键(本文「Navigation & View Keys」),建议回写 PRD 该节加注。
- C3 明确「复用上游会话列表组件 + forge 增强层」——与 PRD UF3「同一底座」一致,细化了复用边界。
- C4 阶段矩阵、C5 抽屉形态、C8 确认文案语义均与 PRD 必答⑦/⑤ 一致,无新增交互偏离。
- **回写记录(2026-09-25,Step 10)**:原型验收(线框 v2.9 + 评审裁决 #15–#23)后,本文件 C2/C3 重写为定形摘要(布局权威指回 `workbench-layout-v2.md`),页面总览更新为已交付;`prd-ui-functions.md` 的 UF2/UF3/UF7/UF8 与 Page Composition 同步回写。分歧记录:头部图标相位规则(新会话零图标)与 dsh 源码 headerCorner 常驻 blank 态为有意分歧(裁决 #17);「开始」tab 可关闭/chipless 底板(裁决 #20/#22/#23)与 dsh 不可关门页语义为有意分歧。
- **回写记录(2026-09-26)**:注册交互按 `docs/decisions/project-storage-and-knowledge.md` §5 v2 重构 —— C7 重写为「添加项目确认卡」(文档位置预览行 + 证据三档门控 + **零 git 强制**);`ERR_FORGE_NOT_DETECTED` 废止(D1)、仓外授权(BIZ-001/003)收窄至高级自定义、可写性改运行时状态;UF7 同步重写;原型两入口(app.js 原位卡 + projects.html)重构,冒烟 106 全绿。
