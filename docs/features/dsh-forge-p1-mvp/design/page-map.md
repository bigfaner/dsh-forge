---
created: "2026-10-02"
related: design/tech-design.md
---

# Page Map: dsh-forge P1（MVP）

> **[stale · 历史设计基线]** 本文描述的三区工作台（左 rail 常驻/中区视图互换/右栏 dock）为 **fix-25 官方基座降位前**的设计期基线，仅作历史参考——现行装配（官方 ConversationRoot/AppFrame 面板 roster/九官方缝）见 `docs/architecture/web-ui-composition.md`（唯一权威，随 HEAD 维护）。本文「视图态 Route」所载状态机（view-state）已退役，中区互换 = 官方 `layout.selectPanel`。

> Electron 单窗应用 + `dsh-client-web` 壳内核——**无 URL 路由**；下表 Route 列 = 工作台视图态标识（状态机切换，非导航跳转；状态保留纪律见 UF-5）。对应 prd-ui-functions.md 的 7 个 UI Function。

## Page Overview

单页三区工作台（左栏 rail 常驻 + 中区一等公民视图互换 + 右栏 dock），附两段式添加项目模态流程与知识详情抽屉滑入层。首用 hero 相位由项目数驱动。

## Pages

### 工作台 · 会话视图（默认态）

**Route**: 视图态 `workbench/session`（默认）
**Layout**: WorkbenchLayout（左 rail / 中会话面板 / 右 dock）
**Auth**: none（本机单用户）
**Navigation**: 默认进入；品牌行/新会话/会话行点击均回到本态

#### Route Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | string | 可选 | 当前打开会话（未选 = 新会话引导） |

#### Query Parameters

无（视图态走应用状态层，不出 URL）。

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 左栏 rail | ForgeSidebar（槽位路线 A 替换 `sidebar.workspaces`） | `forge:projects/list` + dsh 账本实时读 | UF-1 |
| 中区会话面板 | SessionPanel（对话/轨迹/知识召回三 tab） | dsh 面经 `__DSH_TRANSPORT__`；召回 tab = `forge:knowledge/sessionRecall` | UF-4 |
| 右栏 dock | DockContainer（默认收起） | 应用视图状态 | UF-7 |
| hero 相位 | HeroEmpty（项目数=0 时中区替换呈现） | `forge:projects/list` | UF-2 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 本机用户（无角色） | 全部 |

---

### 工作台 · 知识库视图（浏览页签）

**Route**: 视图态 `workbench/knowledge`（左栏「知识库」入口整体切换；右栏强制隐藏、状态保留）
**Layout**: WorkbenchLayout（左 rail / 中知识面板全宽）
**Auth**: none
**Navigation**: 左栏「知识库」入口；切回 = 任一会话入口

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 工具栏 | KnowledgeToolbar（搜索 + 范围） | 本地过滤态 | UF-6 |
| 左轨域树 | DomainTree | `forge:knowledge/listEntries` 聚合目录 | UF-6（域 = 目录派生 ≤3 层） |
| 卡片网格 | KnowledgeCardGrid | `forge:knowledge/listEntries` + heat | UF-6（frontmatter 驱动 + 热度徽章） |
| 详情抽屉 | EntryDrawer（滑入层，Esc/✕ 关闭） | `forge:knowledge/entryDetail` | UF-6（`MarkdownDoc` 渲染，variant=body） |

---

### 添加项目（两段模态流程）

**Route**: 模态 `modal/add-project`（段一 `file-browser` → 段二 `register-form`；可返回上一步）
**Layout**: 覆盖中区的模态
**Auth**: none
**Navigation**: hero CTA / 项目树「＋」；取消/关闭回工作台

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 文件浏览器 | DirectoryBrowser（面包屑/双击进入/单击选中/已注册标记） | 本机目录 + `forge:projects` 预检标记 | UF-3 段一 |
| 注册表单 | RegisterForm（只读回填/项目名/forge 目录/知识库目录/任务清单只读派生/联动） | 默认值推导 + `forge:projects/register` | UF-3 段二 |

---

## Shared Components

| Component | Used In | Description |
|-----------|---------|-------------|
| MarkdownDoc | 详情抽屉（body）/ 嵌入预览（compact，M4+） | `MarkdownText` 族唯一包装入口（架构基线渲染纪律） |
| StateChip / HeatBadge | 卡片网格、召回 tab | 状态与热度徽章（热度 = 事件计数） |
| EmptyState | 知识库/会话召回 tab/会话列表 | 统一空态（P1 简版，M8 打磨） |

## Route Guard Configuration

无路由守卫（无路由层）。**视图态守卫**：知识视图态强制隐藏右栏（UF-5 断言）；hero 相位仅项目数=0 呈现；模态期间中区交互锁定（除两段对话框自身）。
