---
feature: "dsh-forge M2：forge 管线接管（状态层转正 + 插件执行链 + 任务/文档视图）"
---

# dsh-forge M2 — UI Functions

> Requirements 层：定义 UI **要做什么**。基线 = 现有代码现态（官方基座：main 面板互换 / conversation.view 三签 / ui-dockkit 右栏 / OS 选择器注册流）+ 两轮 UI/UX 评审打磨 + 老 forge 21 种任务模板调研。M2 交付最小面：概览 = dock tab（提案|feature|任务 子tab + 搜索 + 排序 + DAG/泳道）；文档 = dock 新 tab（mermaid 图渲染——erDiagram 验收锚，失败回退占位卡）；任务详情 = 模块化抽屉。对账卡已按用户裁决移出。

## UI Scope

「项目概览」dock tab（ui-dockkit 按需开出；入口 = 开始页入口卡[排最前] / 挂接 pill）——子 tab **提案 | feature | 任务**（用户定向顺序），共用搜索栏（中英双语）+ 排序 pill（活跃优先/最新创建）+ chips 过滤三视图统一；文档行点击 → dock 开出**独立文档 tab**（非抽屉；mermaid 图渲染——erDiagram 验收锚，失败回退占位卡）；任务行/DAG 节点/泳道卡片点击 → **模块化任务详情抽屉**（按类型条件区）；会话头挂接 pill + 注册表单派生行。共 4 个 UI Function。

## Navigation Architecture

- **Platform**: web

### Primary Navigation

左栏（官方 ui-sidebar 壳）：品牌行 + PanelRow 仅「知识库」（M2 不加行）+ 工作区浏览区。中区（官方 main 面板互换）：会话（conversation.view 三签——M2 不加签）⇄ 知识 ⇄ hero。右栏（官方 ui-dockkit）：开始 tab（GuideBody 罗盘 + 入口卡 ×4——项目概览[M2]最前 + 工作区文件/终端/浏览器[dsh 原生]）+ 概览 tab + 文档 tab + ＋ 新标签页 + ⛶ 全屏 + ▯ 收展。

### Secondary Pages

| Page | Entry | Return |
|------|-------|--------|
| 概览 dock tab | 开始页入口卡 / 挂接 pill | chip ×（回开始页） |
| 文档 dock tab | 概览子 tab 点文档行 | chip ×（回概览或开始页） |
| 任务详情抽屉 | 任务行/DAG 节点/泳道卡片/挂接 pill/⋯ | Esc / ✕ |
| 转移对话框 | 抽屉或 ⋯ 菜单 | Esc / 取消 |
| OS 目录选择器 | hero CTA / 侧栏 ＋ | 取消/选定进表单 |

---

## UI Function 1: 「项目概览」dock tab · 三子 tab + 三视图

### Placement

右栏官方 ui-dockkit tab。内容 = ov-head（默认折叠——项目名 + 状态摘要一行，▾ 展开路径详情）+ sticky 区（子 tab + 搜索 + 排序）+ 三子 tab 内容。

### Interaction Flow

1. **打开**：dock 开始页入口卡点击 → `openTab(replaceTab:true)` 原位替换开始 tab；或会话头挂接 pill 点击 → dock 开概览 + 任务抽屉打开。
2. **子 tab 切换**：点击子 tab → 清空搜索 + 清空 chips + 收起全部展开态 → 渲染目标子 tab。
3. **搜索**：输入关键词 → 仅更新内容区（IME 安全）→ 中英双语匹配过滤 → 清除按钮出现；切子 tab 自动清空。
4. **排序**：点击 `⇅` pill → 活跃优先 ↔ 最新创建 切换 → 全列表重排。
5. **chips 过滤**：点击七态 chip → toggle 该状态 → 三视图统一过滤；0 计数 chip disabled。
6. **ov-head 折叠**：▾ 展开路径 4 行（工作区/文档/知识/任务清单@hash8）；▴ 收起为一行摘要。
7. **提案/feature 父行**：点击展开元数据（多开——可同时展开多个）；再点击收起。

### 任务子 tab

feature pill 切换 + 七态 chips（0 计数禁用淡化）+ 三视图 seg：
- **列表**：两行布局——主行（ID + 标题 + 中文状态 tag + ⋯）+ 副行 11px（类型/优先级/实际耗时[completed]/前置/挂接/fix）；行点击 → 模块化抽屉
- **DAG**：SVG 贝塞尔连线 + 箭头 marker（完成边绿）+ 节点（状态点 + 键 + 标题 + ⏱实际耗时[completed]）→ 点击开抽屉
- **泳道**：七态横向列（0 计数列折叠为窄头）+ 卡片（foot 含 ⏱实际耗时[completed]）→ 点击开抽屉

排序：`⇅ 活跃优先`（默认）↔ `⇅ 最新创建`；搜索中英双语；chips 过滤三视图统一。

### 提案/feature 子 tab

父行（▸展开元数据：slug/摘要/作者/裁决/谱系 或 摘要/来源提案/任务七态/文档统计）+ 文档行（名称 + 状态标签紧贴 + › 箭头行尾）。feature 不含提案文档。

---

## UI Function 2: 文档浏览（SC4）· 概览子 tab + dock 文档 tab

### Interaction Flow

1. 概览子 tab 点击文档行（**整行可点**，行尾 › 箭头）→ `dockOpenTab("doc", {docRel})`。
2. 同文档已开 → 激活已有 tab（去重，不新开）；新文档 → 开出新 tab（多文档并存）。
3. tab 内容：头部 + 路径栏（canonical + 📁 编辑器 + ↻ 重读）+ Markdown 渲染。
4. mermaid 代码块 → **图渲染**（mermaid 库懒加载；erDiagram = 验收锚，全图型同库）——渲染失败/非法源 → 回退占位卡（源码 + 回退注记；2026-10-06 裁决）。
5. 悬空文档 → 只读占位面（路径栏保留，不崩溃不写入不删行）。
6. chip × 关闭 → 回概览或开始页。

## UI Function 3: 会话头部挂接任务展示（SC6③ 挂接部分）

### Interaction Flow

1. 会话头 session.header actions 位显示挂接 pill（双数据源分型：派发 ⟞ / 执行 ⟞）。
2. ≤2 并排；>2 显示 +N 溢出菜单。
3. pill 点击 → dock 开概览 tab + 切到任务子 tab + 选中 feature + **任务抽屉打开**。
4. 会话切换即时反映（pill 随 session id 变化）。

## UI Function 4: 注册表单任务清单派生行（升级）

### Interaction Flow

1. hero CTA / 侧栏 ＋ → OS 目录选择器（系统对话框一步）→ 选定目录回填表单。
2. 任务清单只读行 = `{dsh-forge-home}(= tasksHome)/{flatten}@{hash8}` **全路径**（应用侧单源下发——与实际建库位置逐字一致，SC2 断言锚）。
3. 确认：正常 → 注册成功 + 建库；疑似移动（同主体异 hash8）→ **拒绝 + 错误条 + 手工指引**（留场；零副作用）。
4. 重选目录 → 复检通过 → 恢复正常确认。

---

## 任务详情抽屉（v11 两分块）

### Interaction Flow

1. **打开途径**（任一）：任务行点击 / DAG 节点点击 / 泳道卡片点击 / 会话头挂接 pill / ⋯ 菜单「查看详情」。
2. **渲染（两分块）**：右侧滑入 → 通用区（头部 ✕ 右端 + 标题 + **标签行 = chip 组件,格式 `{key} : {value}`**：类别[只显类型,着色]/优先级/**预估耗时**/**实际耗时**[仅 completed]/复杂度[高中低]/影响）→ **块一 任务内容**：「目标/结果」**上下展示**（标签在上、内容在下;结果综合任务记录）+ 类型模板（coding 顺序 = 参考文档 → 改动范围 → 验收标准 → 单元测试覆盖率 → 备注;**参考文档 chip 可点击 → dock 开新 tab**（refDocs 锚点映射,docRel 去重,抽屉保持）;改动范围双列 = 预期声明 ↔ 实际 commit 查找[无提交回退记录] + 差异摘要;文件路径完整展示）+ 单元测试覆盖率（实际/预期+刻度线+判定）→ **块二 时间线**：现状条 + 事件流 → 转移按钮。块标题 = 底色条 + 主色加粗;子标题与键标签全加粗（层次阶梯）。
3. **折叠**：块头部点击**就地更新**（grid 0fr/1fr 高度过渡 + caret 旋转;不重建抽屉、不重放滑入动画——仅切换任务时播放）;aria-expanded 同步;Enter/Space 可用;会话级保持。
4. **调宽**：左缘手柄拖拽（320–760px 钳制）；双击复位 420；←→ 键盘微调 ±32；宽度会话级保持。
5. **关闭**：Esc / ✕（头部右端）/ 点击另一任务（切换抽屉内容）。
6. **转移**：抽屉内「转移状态…」→ 对话框（from≠to + reason 必带）→ 确认 → 留审计 + 若终态则触发 autoRestore。**目标态仅列允许集**（`allowedTransitions` = 状态机纯函数计算，所见即所得——服务端同源提前校验，用户点不到非法目标；tech-design Interface 10）。
7. **界面说明最小化**：抽屉与概览不渲染解释性文字;数据源语义（forge.db 结构化负载/任务无文档）、实际范围「commit 优先/记录回退」策略、类型模板分发表锚定 ui-design.md。

### 任务内容区 · 类型模板（v7）

| 模板族 | 类型 | 内容 |
|---|---|---|
| coding | coding.* | 参考文档（可点击 → dock 开 tab） / 改动范围（预期↔实际双列,路径完整展示）/ 验收标准（checklist，终态全勾） / 备注（⚠ 警示,置于覆盖率之下） |
| fix | coding.fix / doc.fix | 症状 / 修复步骤 / 验证命令（链元数据织入时间线「创建」事件） |
| doc | doc | 大纲 / 交付物 / 读者 |
| gate | gate | 走查步骤 / 检查项（场景由目标·预期承载） |
| test | test.* | 命令 / 采集指标 / 基线 |
| eval | eval.* / validation.* | 评估对象 / 评分表 / 结论（得分由结果·实际承载） |

**单元测试覆盖率**（coding.* / code-quality.*，内容块内、验收标准之后）：实际 N% / 预期 ≥M% + 进度条（填充=实际）+ 阈值刻度线（位置=预期）+ 判定徽标（✓达标 / 未达标 / 未执行——无实际值时）。

### 关联与过程 · 时间线（合并单块）

- **现状条**：阻塞原因（blocked）/ 前置依赖（键+当前状态）/ 挂接会话 pill（派发/执行分型）/ Surface（test.*）/ 质量门 M/N（gate）/ 得分+严重度（eval.*）。
- **事件流**：创建（前置声明;fix 链来源/根因/源文件/测试脚本）→ 领取（digest + 派发⟞pill）→ 提交（gate 结果 + commit 徽标/摘要/文件数 + 执行⟞pill）→ auto-block / auto-restore / 人工转移（from→to+reason）/ 评估（得分）。

---

## Page Composition

| Page | Type | UF | Notes |
|------|------|----|----|
| dock「项目概览」tab | existing（M2 新增） | UF-1 | 提案\|feature\|任务 三子 tab + DAG/泳道 |
| dock 文档 tab | existing（M2 新增） | UF-2 | 按 docRel 去重；mermaid 图渲染（erDiagram 验收锚，失败回退占位卡） |
| 任务详情抽屉 | existing | UF-1/UF-3 | 两分块（任务内容/时间线,顺滑折叠）+ chip kv 标签（含实际耗时[completed]）+ 改动范围双列（commit 优先）+ 单元测试覆盖率 + 拖拽调宽 |
| 会话头 session.header actions | existing | UF-3 | 双源分型 pill |
| OS 选择器 → 注册表单 | existing | UF-4 | hash8 + 疑似移动 |
