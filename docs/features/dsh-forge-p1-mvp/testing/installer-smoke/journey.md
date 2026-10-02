---
feature: "dsh-forge-p1-mvp"
journey: "installer-smoke"
risk_level: "Medium"
golden_path: false
surface_types: ["web"]
surface_keys: ["web"]
sources:
  - docs/features/dsh-forge-p1-mvp/prd/prd-spec.md
  - docs/features/dsh-forge-p1-mvp/prd/prd-ui-functions.md
  - docs/proposals/dsh-forge-p1-mvp/proposal.md
generated: "2026-10-03"
---

# Journey: installer-smoke

**Risk Level**: Medium（安装 = 机器状态变更 + 新建会话 = 实体创建，非纯观察，按注释分类标准归中档）

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

最终用户在 Windows 上安装 MVP 安装包并完成启动冒烟：安装 → 启动 → 主界面（三区工作台）可达 → 会话面板可用——验证打包 / CI 链路在安装形态下真实可走。

**PRD 溯源**: prd-spec Goals「MVP 门通过」（安装包冒烟 4 步：安装 → 启动 → 主界面可达 → 会话面板可用）与 In Scope「MVP 门：… Windows 安装包启动冒烟」；UF-1 / UF-2 / UF-4（首屏、零项目 hero 相位与会话面板）；提案 Key Scenario「MVP 门走查」、SC-MVP 后半（安装包构建并启动冒烟通过）、SC-NFR（离线自足）。

## Setup

- Windows 构建产物就位：MVP 安装包（含静态资源与运行时，离线自足——不依赖网络分发）；产物来源（打包 / CI 链路构建）不在本旅程内
- 目标机器无既有安装（全新安装路径）
- 范围记账：仅覆盖全新安装单边界——覆盖安装 / 升级 / 残留数据处置归 M8「三平台安装包与更新检测」（提案 Out of Scope），本旅程不设断言

## Happy Path

### Step 1: 运行安装包完成安装

**User Action**: 在 Windows 上运行 MVP 安装包

**Expected Result**: 安装流程走完并给出完成反馈，无错误弹窗、无中途回滚迹象；应用启动入口就位（开始菜单 / 桌面快捷方式，供 Step 2 行使）。「静态资源本地打包，无 CDN / 远程脚本 / 远程字体」为打包产物属性（提案 NFR 原文），验证通道 = 安装产物与构建配置检查（审计通道承载）；运行期网络断言由 Step 2b 行使

### Step 2: 启动已安装应用

**User Action**: 从安装入口（Step 1 快捷方式）启动应用

**Expected Result**: 应用主窗口打开并完成装载进入首屏——全程无报错弹窗、无白屏停留；装载在等待窗口内完成（超时未呈现即冒烟失败，口径见 Step 2c）。审计注记：装载机制（薄宿主 + 自有前端入口 + 壳内核经 boot manifest 掌舵）为架构内部件（提案 In Scope M0），由契约面 pin 测试（G1 门）承载，非浏览器可观察断言

### Step 3: 主界面可达

**User Action**: 等待应用首屏呈现

**Expected Result**: 三区工作台骨架可达——左栏导航 rail 入口在位（品牌行 / 新会话 / 知识库 / 设置；零项目态下项目树 + 会话列表呈 rail 空态引导，UF-1 States）；中区呈现 hero 空态 +「＋添加项目」CTA——全新安装零项目时中区的确定相位（UF-2），注册成功后让位于会话视图；右栏 dock 默认收起（轨道归零）

### Step 4: 会话面板可用

**User Action**: 点左栏 rail「新会话」（品牌行为等价入口——UF-1 交互流第 1 条：点击 → 中区切换到会话视图并新建会话）

**Expected Result**: 中区切换为会话视图并新建会话，呈现引导输入的空会话态（UF-4 States）；「会话面板可用」的可观察判据 = 对话 tab 输入区可聚焦、键入字符即回显（发送不走查）。真实 agent 往返由兄弟 Journeys session-workbench（Step 2）与 knowledge-recall-flywheel 承载，本旅程验证安装形态下面板可达可用，不重复行使

## Edge Cases

### Step 2b: 离线环境启动

**Precondition**: 目标机器处于断网环境

**User Action**: 启动应用并走查主界面加载

**Expected Result**: 应用加载与 UI 走查不因网络请求失败而阻塞或降级（离线自足断言：无远程脚本 / 字体 / 样式拉取；观察通道 = 启动期网络请求记录）

### Step 2c: 启动异常的失败口径（显式记账）

**Precondition**: 安装完成但启动异常（运行时缺失 / 首启崩溃 / 白屏类故障）

**User Action**: 启动应用并观察结果

**Expected Result**: 冒烟即判失败——首屏未在等待窗口内呈现；可见失败呈现 = OS 级进程退出 / 崩溃对话框。产品级启动错误态 UI 归 M8「空错态与过渡打磨」（提案 Out of Scope），本旅程不设断言（记账：失败可检出，失败态呈现不属本旅程）

### Step 4b: 空消息提交被拦截（validation-error）

**Precondition**: Step 4 会话已建，对话 tab 输入框为空或仅空白字符

**User Action**: 直接点发送

**Expected Result**: 不发送——无消息上屏、无 agent 往返（冒烟最小口径）；焦点保持 / 引导态保持等完整行为断言由兄弟 Journey session-workbench Step 2c 承载（同一输入面，见 Derived Outcomes）

## Derived Outcomes（Web Surface 必察项）

- **validation-error** — 实步覆盖（Step 4b）：唯一输入面 = 会话输入框（Step 4 已将输入区拉入走查范围），空 / 纯空白提交不产生消息上屏、agent 往返与副作用——source: inferred（surface-web required_outcomes 必察项 × UF-4；PRD 未定义空消息行为，完整行为断言由 session-workbench Step 2c 承载，本旅程取冒烟最小口径）
- **session-expired** — N/A：单机产品无登录会话 / 过期概念（PRD 单机安全边界：本机回环、模型 API 凭证归 dsh profile 域，同兄弟 Journey 口径）——source: inferred（必察项 × PRD 安全边界映射）

## Journey Invariants

- 加载与走查全程无远程资源请求（无远程脚本 / 字体 / 样式拉取）——运行期观察由 Step 2b 行使，安装产物侧由 Step 1 产物检查承载
- 安装形态行为与开发形态一致——机制 = 同一 boot manifest 掌舵装载链路（提案 In Scope M0 定义该装载机制；「安装 ≡ 开发」等价性主张 cited sources 未明文，source: inferred），属审计通道（构建产物链路审查承载），非浏览器可观察断言
