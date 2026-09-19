---
feature: "dsh-forge M1 桌面纯壳"
---

# dsh-forge M1 桌面纯壳 — UI Functions

> Requirements layer: defines WHAT the UI must do. Not HOW it looks (that's ui-design.md).

## UI Scope

M1 的 UI 面构成:

- **主窗口:100% 继承上游 dsh web GUI**(会话/聊天/审批/计划/设置/文件树/workspace 切换),经 carrier 接入,**零重写、零改动、零新增应用内页面** —— 不在本 feature 设计范围。
- **新增 UI 仅 4 个壳级最小面**:UF1 系统托盘、UF2 系统通知、UF3 更新提示、UF4 宿主崩溃恢复提示。
- **UI 沿用最大化原则(用户定向,2026-09-19)**:壳级新增面优先参照上游 apps/desktop 已有同类实现(更新提示、locale 机制、对话框先例),仅上游确无对应物时才自研,视觉与交互风格与上游一致。
- 壳层自有文案中英双语,接入上游 locale 机制。

## Navigation Architecture

- **Platform**: web
  > 注:forge surface 类型无 `desktop`,经用户确认按 `web` 近似 —— 实际载体为桌面壳,渲染面为 web 技术、指针驱动;桌面载体的测试编排差异在 /test-guide 阶段处理。项目为绿地仓库且主窗口页面属上游资产,无 sitemap.json 可校验,本文 existing-page 放置统一指向「继承上游 GUI 的主窗口容器」。

### Primary Navigation (shared across pages)

| # | Label | Target Page | Icon Keyword |
|---|-------|-------------|-------------|
| 1 | 主窗口主导航(继承上游 GUI,不在本 feature 设计范围) | 主窗口(继承上游 GUI 容器) | 沿用上游 |
| 2 | 托盘菜单 | 系统托盘面(UF1) | 应用图标 |
| 3 | 系统通知 | 系统通知面(UF2) | 应用图标 |

### Secondary Pages (navigated from a parent page)

| Page | Entry Point (UF# or action) | Return Target |
|------|-----------------------------|---------------|
| (无新增应用内页面) | — | — |
| 托盘菜单「显示主窗口」 | UF1 菜单动作 | 主窗口 |
| 系统通知点击 | UF2 通知动作 | 主窗口(聚焦对应会话) |
| 更新提示覆盖层 | UF3(启动检测触发) | 主窗口 |
| 崩溃恢复提示覆盖层 | UF4(宿主崩溃触发) | 主窗口 |

### Navigation Rules

- 主窗口为唯一应用内页面(继承),M1 不新增任何应用内页面
- 所有壳级面(托盘/通知/覆盖层)的导航终点都是主窗口
- 覆盖层(UF3/UF4)不阻断主窗口既有交互:更新提示可关闭;崩溃提示随恢复流程演进

## UI Function 1: 系统托盘

### Placement

- **Mode**: new-page(壳级 OS 面,非路由页面)
- **Target Page**: 系统托盘(应用图标 + 托盘菜单)
- **Position**: 操作系统托盘区;关窗驻留的唯一常驻入口

### Description

应用常驻系统托盘:主窗口关闭后应用驻留不退出;托盘菜单提供「显示主窗口」与「退出」动作。文案中英双语。

### User Interaction Flow

1. 用户关闭主窗口 → 应用驻留托盘(图标保持)
2. 用户点击托盘图标/菜单项「显示主窗口」→ 主窗口恢复显示并聚焦
3. 用户点击托盘菜单「退出」→ 应用完全退出(壳与宿主子进程)

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 应用图标(平台尺寸变体) | 资源 | 应用包内 | dsh-forge 身份 |
| 菜单文案(显示/退出) | 文案 | 上游 locale 机制 | 中英双语 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 常驻 | 托盘图标 + 菜单 | 应用运行期 |
| 退出中 | 图标移除,进程终结 | 菜单「退出」 |

### Validation Rules

- 关闭主窗口 ≠ 退出应用(仅用户显式「退出」才终结)
- 「退出」必须同时终止壳与宿主子进程,不留孤儿进程

---

## UI Function 2: 系统通知

### Placement

- **Mode**: new-page(壳级 OS 面,非路由页面)
- **Target Page**: 系统通知
- **Position**: 平台通知中心/横幅

### Description

两类会话状态触发系统通知:①等待用户输入(approval / user-questions);②回合完成。点击通知聚焦对应会话。文案中英双语。

### User Interaction Flow

1. 会话进入「等待用户输入」或「回合完成」→ 系统通知弹出
2. 用户点击通知 → 主窗口前置/恢复并聚焦对应会话

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 通知标题/正文(两类状态各一套) | 文案 | 上游 locale 机制 | 中英双语 |
| 会话标识 | 标识 | 会话状态 | 点击路由到对应会话 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 等待输入通知 | 标题 + 会话信息 | 会话等待用户输入 |
| 回合完成通知 | 标题 + 会话信息 | 回合结束 |
| 已点击 | 通知消失,窗口聚焦 | 用户点击 |

### Validation Rules

- 通知点击必须定位到触发它的那个会话(多会话并存时不可错位)

---

## UI Function 3: 更新提示

### Placement

- **Mode**: existing-page(全局覆盖层)
- **Target Page**: 主窗口(继承上游 GUI 容器;绿地仓库无 sitemap,不做路由校验)
- **Position**: 应用内全局提示(位置与形态参照上游 apps/desktop 更新提示先例)

### Description

启动更新检测发现新版本时,应用内显示更新提示并提供跳转发布页动作;无更新与检测失败均静默。v1 档位:检测 → 提示 → 引导手动下载。

### User Interaction Flow

1. 应用启动 → 后台检测 GitHub Releases feed
2. 检测到新版本 → 应用内提示出现
3. 用户点击「查看发布页」→ 系统浏览器打开发布页
4. 用户关闭提示 → 提示消失,不影响使用

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 最新版本号 | 版本 | GH Releases feed(DF001) | 与当前版本比对 |
| 发布页地址 | URL | feed | 系统浏览器打开 |
| 提示文案 | 文案 | 上游 locale 机制 | 中英双语 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 有更新 | 提示可见 + 跳转动作 | 检测到新版本 |
| 无更新 | 无 UI | 版本一致 |
| 检测失败/离线 | 无 UI(静默降级) | feed 不可达 |

### Validation Rules

- 检测失败绝不弹错、不阻断启动
- 提示可关闭,不常驻打扰

---

## UI Function 4: 宿主崩溃恢复提示

### Placement

- **Mode**: existing-page(全局覆盖层/对话框)
- **Target Page**: 主窗口(继承上游 GUI 容器)
- **Position**: 全局状态覆盖层

### Description

宿主子进程异常退出时,壳保持存活并提示用户,随后重启子进程并从 session 持久化恢复最近会话;提示随恢复流程演进。

### User Interaction Flow

1. 宿主子进程崩溃 → 壳存活,主窗口显示崩溃提示
2. 壳重启宿主子进程 → 提示「恢复中」
3. 恢复完成 → 提示消失,最近会话状态从持久化恢复呈现
4. 恢复失败 → 提示失败原因与排查引导(如重启应用)

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 提示文案(崩溃/恢复中/失败) | 文案 | 上游 locale 机制 | 中英双语 |
| 恢复状态 | 状态 | 壳监护 | 驱动提示态切换 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 崩溃提示 | 提示可见 | 宿主异常退出 |
| 恢复中 | 进度提示 | 子进程重启 |
| 恢复完成 | 提示消失 | 会话恢复呈现 |
| 恢复失败 | 失败原因 + 引导 | 重启或恢复失败 |

### Validation Rules

- 宿主崩溃时壳主进程必须存活
- 恢复依据 session 持久化,不依赖内存态

---

## Page Composition

| Page | Type | UI Functions | Position Notes |
|------|------|-------------|----------------|
| 主窗口(继承上游 GUI) | existing(继承,零新增) | UF3、UF4(全局覆盖层) | M1 唯一应用内页面 |
| 系统托盘 | new(OS 级面,非路由页面) | UF1 | 系统托盘区常驻 |
| 系统通知 | new(OS 级面,非路由页面) | UF2 | 平台通知中心/横幅 |
