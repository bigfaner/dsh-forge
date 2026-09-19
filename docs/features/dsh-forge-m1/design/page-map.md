---
created: "2026-09-20"
related: design/tech-design.md
---

# Page Map: dsh-forge M1 桌面纯壳

> M1 唯一应用内页面 = 主窗口,**100% 继承上游 client GUI**(非本工程路由资产);壳级面为 OS 原生面或注入式覆盖层,**零新增路由页面**。本文件记录 M1 的面清单与挂接方式,供 gen-contracts/gen-test-scripts 定位载体级测试入口。

## Page Overview

单窗口桌面应用:Electron 壳经 `dsh-app://` 自定义协议承载上游 SPA;壳以注入方式叠加 2 个覆盖层(UF3/UF4);OS 侧 2 个原生面(UF1 托盘 / UF2 通知)。无路由守卫、无多页导航。

## Pages

### 主窗口(继承上游 GUI,零新增页面)

**Route**: `dsh-app://`(上游 SPA index;路由属上游资产,本工程不定义、不扩展)
**Layout**: 上游 client UI 插件族(经 `__DSH_TRANSPORT__` carrier 接入)
**Auth**: none(本地应用;API key 配置在上游设置面,SC1 验证路径)
**Navigation**: 桌面启动 / 托盘「显示主窗口」(UF1)/ 通知点击(UF2)

#### Route Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| (无 —— 壳不扩展上游路由) | — | — | — |

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| (无) | — | — | — |

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 会话/聊天/审批/计划/设置/文件树/workspace | 上游 UI 插件族(继承) | 宿主 RPC/流(继承) | 全部继承,不在 M1 设计范围;SC7 验证功能对等 |
| UF3 更新横幅(覆盖层) | shell-ui banner | `dshForge.update.*` IPC | `top 40px` 悬浮,非路由区块 |
| UF4 崩溃恢复覆盖层 | shell-ui overlay | `dshForge.recovery.*` IPC | 全屏 mask + 对话框,非路由区块 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 本地用户(无角色体系) | 全部 |

---

### 壳级 OS 面(非页面,列出供测试定位)

| 面 | 载体 | 入口 | 回归目标 |
|----|------|------|----------|
| UF1 系统托盘 | OS 托盘区(原生菜单) | 托盘图标左键/右键 | 主窗口 |
| UF2 系统通知 | OS 通知中心/横幅 | 会话事件触发;点击 | 主窗口(对应会话) |

## Shared Components

| Component | Used In | Description |
|-----------|---------|-------------|
| shell-ui 更新横幅 | 主窗口(UF3) | 注入式覆盖层,详见 ui-design.md |
| shell-ui 崩溃恢复覆盖层 | 主窗口(UF4) | 注入式覆盖层,详见 ui-design.md |
| preload `dshForge.*` 语义动词 | UF3/UF4 | IPC 白名单 + sender 校验 |
| i18n `t()` 文案 | UF1/UF2/UF3/UF4 | 壳层文案经上游 locale 机制(zh/en)解析 CopyKey,零硬编码字符串(tech-design Interface 7) |

## Route Guard Configuration

| Route Pattern | Guard | Redirect |
|---------------|-------|----------|
| (无 —— 本地单窗口应用,无路由守卫) | — | — |
