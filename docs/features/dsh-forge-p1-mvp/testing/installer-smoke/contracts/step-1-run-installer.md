---
journey: "installer-smoke"
step: 1
step-action: "运行安装包完成安装"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/installer-smoke/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: installer-smoke / Step 1: 运行安装包完成安装

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- anchors 注记: OS 级安装场景，无 web 页面对应——锚点留空（不猜测） -->
<!-- state-verification: partial（安装产物属性经审计通道 = 产物与构建配置检查承载；运行期网络断言由 Step 2b 行使） -->

## Outcome "success"
- Preconditions: "Windows 构建产物就位：MVP 安装包（含静态资源与运行时，离线自足——不依赖网络分发）；目标机器无既有安装（全新安装路径）"
  fixture_spec:
    entities:
      - entity_type: "InstallerArtifact"
        min_count: 1
        field_constraints:
          - field: "packaging"
            value: "离线自足（静态资源本地打包，运行时树全量随包分发；安装期零网络）"
    state_requirements:
      - description: "目标机器全新安装态（无既有安装——仅覆盖全新安装单边界；覆盖安装 / 升级 / 残留数据处置归 M8，本旅程不设断言）"
        prerequisite_entity: "InstallerArtifact"
- Input: "在 Windows 上运行 MVP 安装包"
- Output: "安装流程走完并给出完成反馈，无错误弹窗、无中途回滚迹象；应用启动入口就位（开始菜单 / 桌面快捷方式，供 Step 2 行使）。「静态资源本地打包，无 CDN / 远程脚本 / 远程字体」为打包产物属性（提案 NFR 原文），验证通道 = 安装产物与构建配置检查（审计通道承载）"
- State: "机器进入已安装态（每用户安装路径落盘；快捷方式注册）；产物来源（打包 / CI 链路构建）不在本旅程内"
- Side-effect: "机器状态变更（文件落盘 + 快捷方式注册）"

## Journey Invariants

- 加载与走查全程无远程资源请求（无远程脚本 / 字体 / 样式拉取）——运行期观察由 Step 2b 行使，安装产物侧由 Step 1 产物检查承载
- 安装形态行为与开发形态一致——机制 = 同一 boot manifest 掌舵装载链路（提案 In Scope M0 定义该装载机制；「安装 ≡ 开发」等价性主张 cited sources 未明文，source: inferred），属审计通道（构建产物链路审查承载），非浏览器可观察断言

## Fixture Specification

本 Contract 前置数据状态：InstallerArtifact（离线自足安装包，至少 1 份）＋ 目标机器全新安装态。范围记账：仅全新安装单边界。
