---
feature: "dsh-forge M2：forge 管线接管（状态层转正 + 插件执行链 + 任务/文档视图）"
---

# dsh-forge M2：forge 管线接管 — UI Functions

> Requirements 层：定义 UI **要做什么**（HOW it looks 归 ui-design）。基线 = P1 交付的三区工作台（官方基座 + 产品内容叠加，fix-25 现态：中区会话面板 + 右栏官方侧栏；产品页签沿官方页签机制登记——机制归 tech-design）。M2 交付最小面：概览页签仅任务列表视图（DAG / 泳道 = M3）；对账卡已按用户裁决移出（2026-10-05）；会话头部执行上下文展示（SC6④）= M3。

## UI Scope

既有单页工作台上的扩展：右栏 dock 新增页签 ×2（概览 · 任务列表视图 / 文档 · SC4 只读浏览）+ 会话头部挂接任务展示（SC6③ 挂接部分）+ 注册表单任务清单派生行升级（单源下发 + 疑似移动拒绝提示）。共 4 个 UI Function。

## Navigation Architecture

- **Platform**: web

### Primary Navigation (shared across pages)

不变（P1 交付面）：左栏 rail（品牌 / 新会话 / 知识库 / 项目树 + 会话列表 / 设置）；中区会话面板；右栏 dock。

### Secondary Pages (navigated from a parent page)

| Page | Entry Point (UF# or action) | Return Target |
|------|-----------------------------|---------------|
| 概览页签（右栏 dock 页签） | dock 页签条点「概览」 | 再点会话页签 / 收起右栏即回（面板状态保留） |
| 文档页签（右栏 dock 页签） | dock 页签条点「文档」 | 同上 |
| 文档详情（页签内视图态） | UF-2 点文档条目 | 返回列表（页签内返回，非路由） |
| 人工状态转移（行内对话框） | UF-1 任务行操作 | Esc / ✕ 取消；确认后回列表（行已更新） |

### Navigation Rules

- 概览 / 文档为项目跟随页签（P1 UF-7 机制最简版口径：可见集 = 当前项目 + 全局）；项目切换 → 页签集切换不打断面板。
- 会话头部挂接展示为常驻头部元素（有挂接时呈现，无挂接不占位）。
- 页签与对话框均有显式关闭 / 返回路径；文档详情悬空态可直接返回列表。

## UI Function 1: 概览页签 · 任务列表视图

### Placement

- **Mode**: existing-page
- **Target Page**: 工作台 · 右栏 dock（新页签「概览」）
- **Position**: dock 页签条新增一枚；内容 = feature 绑定选择器 + 七态 chips + 任务列表

### Description

任务域的看板消费面：feature 绑定（状态由相位推导机自动维护，无全局汇总）→ 七态 chips 过滤 → 任务行（标题 / 类型 / 状态 / 挂接会话两类）。数据全部直读每工作区任务库；tool 侧写入后单次重取即见新值。行内提供人工状态转移（人类通道，from≠to + 原因必带）。

### User Interaction Flow

1. 用户点 dock「概览」页签 → 呈现 feature 选择器（缺省当前项目最后一个活跃 feature）。
2. 选 feature → 任务列表按当前 chips 过滤集呈现；点 chip 增删过滤态。
3. 点任务行 → 行展开呈现执行记录时间线（动词 / 状态变迁 / gate 结果 / 提交哈希）与挂接会话（派发 / 执行）。
4. 行操作「转移状态」→ 对话框选目标状态 + 填原因 → 确认 → 落库后行即时更新；取消无副作用。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| feature 列表（名 + 状态） | list | 每工作区库（features） | 相位 = 推导机维护，只读呈现 |
| 任务行（键 / 标题 / 类型 / 状态 / 挂接会话） | list | 每工作区库（tasks + 挂接双数据源） | 七态 chips 过滤参数 |
| 执行记录时间线 | list | 每工作区库（审计记录按序） | 行展开惰性拉取 |
| 人工转移（目标状态 + 原因） | form | 人类通道动词提交 | 原因必带校验 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 空态（该 feature 无任务） | 列表空态 + 指引（任务由 run-tasks / addTask 产生） | 新 feature |
| 空态（项目零 feature） | 页签级空态（发现面零建行的一等展示） | 非结构化仓（S9① 零命中形态） |
| 加载中 | 行级骨架 | 库查询进行时 |
| 写入后刷新 | 行 / 状态即时更新 | tool 写入返回后单次重取（断言锚） |

### Validation Rules

- 人工转移：目标状态 ≠ 当前状态；原因非空；非法终值由库约束拒绝并回显错误。
- 过滤组合至少呈现一态（全灭 = 全部显示）。

---

## UI Function 2: 文档页签 · 只读浏览（SC4）

### Placement

- **Mode**: existing-page
- **Target Page**: 工作台 · 右栏 dock（新页签「文档」）
- **Position**: dock 页签条新增一枚；内容 = 文档列表 → 详情视图态（页签内切换）

### Description

feature 文档与提案文档的只读消费面：列表（按 feature 分组 + 提案组，来自发现面建行）→ 详情（正文只读渲染 + canonical 路径栏 + 只读徽标 + 「在编辑器中打开」）。仓内 / 仓外两模式同构；悬空引用只读缺省渲染并标注。

### User Interaction Flow

1. 用户点 dock「文档」页签 → 文档列表（feature 文档索引 + 提案文档，含每文档摘要）。
2. 点条目 → 详情视图态：正文只读渲染 + canonical 路径栏 + 只读徽标；返回回列表。
3. 点「在编辑器中打开」→ 系统关联编辑器打开该文件（应用自身不写入）。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 文档列表（feature 分组 / 类型 / 摘要） | list | 每工作区库（feature_documents + proposals） | 发现面单向吸收建行 |
| 文档正文 | text | 工作区文件（只读） | 路径 = 库中 canonical 引用 |
| 悬空标记 | flag | 文件存在性判定 | 只读缺省渲染 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 空态（零命中） | 「未发现结构化文档」+ 目录约定说明 | 非结构化仓（S9①） |
| 悬空态（引用在、文件缺） | 缺省占位 + 悬空标注 + 路径栏保留 | 分支切换 / 文件移动 |
| 加载中 / 渲染失败 | 骨架 / 错误条 + 重试 | 文件读取中 / 失败 |

### Validation Rules

- 只读纪律：页签内零写入入口；「在编辑器中打开」为跳转非读写。
- 正文渲染不含 frontmatter 元数据块（元数据在路径栏 / 摘要位呈现）。

---

## UI Function 3: 会话头部挂接任务展示（SC6③ 挂接部分）

### Placement

- **Mode**: existing-page
- **Target Page**: 工作台 · 中区会话面板 · 会话头部
- **Position**: 头部元素（有挂接时呈现；具体缝位 = tech-design 必答 §7-13 挂接部分）

### Description

会话侧挂接可见面：该会话 claim 过的任务在会话头部呈现（任务键 + 标题 + 当前状态），与库中挂接行一致；点挂接跳转概览页签并定位该任务。执行上下文展示（分支 / worktree，SC6④）= M3，本 UF 不含。

### User Interaction Flow

1. 用户查看某会话头部 → 若该会话挂接过任务，呈现挂接任务行（可多个）。
2. 点挂接任务 → 右栏切到概览页签并选中对应 feature / 定位任务行。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 挂接任务（键 / 标题 / 状态） | list | 每工作区库（挂接表按会话反查） | 与库一致（e2e 断言锚） |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 无挂接 | 不占位 | 会话未 claim 过任务 |
| 有挂接 | 头部行呈现（状态随写入更新） | claim 发生后 |

### Validation Rules

- 展示与库中挂接行一致（单次重取即见新值口径）；不提供头部写入入口（只看）。

---

## UI Function 4: 注册表单任务清单派生行（升级）

### Placement

- **Mode**: existing-page
- **Target Page**: 添加项目 · 注册表单（P1 UF-3 既有行升级）
- **Position**: 表单「任务清单与记录」只读行

### Description

派生行升级为单源：展示 `{dsh-forge-home}/{扁平化}-{hash8}`（应用侧计算 + 下发，取代 web 侧自算）；疑似移动（同扁平化主体异 hash8 目录）时注册被拒并给出手工指引文案。

### User Interaction Flow

1. 用户选定工作区目录 → 派生行即时更新（单源下发值）。
2. 确认注册 → 正常路径建项目 + 建每工作区库；疑似移动时 → 拒绝反馈 + 指引（删除孤儿目录或改回原名后重试）。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 派生路径串 | text（只读） | 应用侧单源下发 | 与实际建库位置逐字一致（SC2 断言） |
| 疑似移动指引 | 提示文案 | 注册预检 | 拒绝 + 手工指引（认领对话框 = M3） |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 正常派生 | 只读行展示完整路径（含 hash8 后缀） | 选定目录后 |
| 疑似移动 | 拒绝 + 指引文案（不清理不认领） | 预检发现同主体异 hash8 目录 |

### Validation Rules

- 派生行只读（不可编辑）；换选工作区时随新目录重构（沿 P1 联动规则）。

---

## Page Composition

| Page | Type | UI Functions | Position Notes |
|------|------|-------------|----------------|
| 工作台 · 右栏 dock「概览」页签 | existing（新页签） | UF-1 | dock 页签条新增；任务列表视图（DAG/泳道 M3） |
| 工作台 · 右栏 dock「文档」页签 | existing（新页签） | UF-2 | dock 页签条新增；页签内列表↔详情视图态 |
| 工作台 · 中区会话头部 | existing | UF-3 | 头部元素（缝位 tech-design 定） |
| 添加项目 · 注册表单 | existing | UF-4 | P1 UF-3 既有行升级 |
