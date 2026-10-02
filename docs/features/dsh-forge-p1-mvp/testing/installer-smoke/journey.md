---
feature: "dsh-forge-p1-mvp"
journey: "installer-smoke"
risk_level: "Low"
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

**Risk Level**: Low

<!-- Risk Classification Criteria:
  High   = Workflow involves state mutation, data loss risk, or irreversible operations
  Medium = Workflow involves multi-step interaction without irreversible side effects
  Low    = Workflow is read-only or purely observational
-->

## Overview

最终用户在 Windows 上安装 MVP 安装包并完成启动冒烟：安装 → 启动 → 主界面（三区工作台）可达 → 会话面板可用——验证打包 / CI 链路在安装形态下真实可走。

**PRD 溯源**: prd-spec Goals「MVP 门通过」（安装包冒烟 4 步：安装 → 启动 → 主界面可达 → 会话面板可用）与 In Scope「MVP 门：… Windows 安装包启动冒烟」；UF-1 / UF-4（首屏与会话面板）；提案 Key Scenario「MVP 门走查」、SC-MVP 后半（安装包构建并启动冒烟通过）、SC-NFR（离线自足）。

## Setup

- Windows 构建产物就位：MVP 安装包（含静态资源与运行时，离线自足——不依赖网络分发）
- 目标机器无既有安装（全新安装路径）

## Happy Path

### Step 1: 运行安装包完成安装

**User Action**: 在 Windows 上运行 MVP 安装包

**Expected Result**: 安装完成，应用可执行与运行时就位；静态资源本地打包，无 CDN / 远程脚本 / 远程字体依赖

### Step 2: 启动已安装应用

**User Action**: 启动安装好的应用

**Expected Result**: 薄宿主拉起，自有前端入口 + 壳内核经 boot manifest 掌舵完成装载；加载全程无远程资源请求

### Step 3: 主界面可达

**User Action**: 等待应用首屏呈现

**Expected Result**: 三区工作台主界面可达——左栏导航 rail（品牌行 / 新会话 / 知识库 / 项目树 + 会话列表 / 设置）、中区面板、右栏 dock 默认收起

### Step 4: 会话面板可用

**User Action**: 在中区会话面板发起新会话

**Expected Result**: 会话面板可用——新建会话可达、对话 tab 输入区可交互（真实 agent 往返属知识飞轮 Journey 范围，此处验证面板可用性）

## Edge Cases

### Step 2b: 离线环境启动

**Precondition**: 目标机器处于断网环境

**User Action**: 启动应用并走查主界面加载

**Expected Result**: 应用加载与 UI 走查不因网络请求失败而阻塞或降级（离线自足断言：无远程脚本 / 字体 / 样式拉取）

### Step 3b: 零项目首启 hero 空态

**Precondition**: 全新安装，应用数据库无任何项目记录

**User Action**: 启动后查看中区

**Expected Result**: 中区呈现 hero 空态与「＋添加项目」CTA（首用引导在安装形态下同样成立）

## Journey Invariants

- 加载与走查全程无远程资源请求（无远程脚本 / 字体 / 样式拉取）
- 安装形态与开发形态走同一 boot manifest 掌舵链路，行为一致
