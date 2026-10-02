---
journey: "installer-smoke"
step: 3
step-action: "主界面可达"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/installer-smoke/journey.md
anchors:
  web:
    page: "工作台·会话视图（默认态）"
    route: "workbench/session"
    requires_auth: false
    layout: "WorkbenchLayout（左 rail / 中会话面板 / 右 dock）"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: installer-smoke / Step 3: 主界面可达

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial -->

## Outcome "success"
- Preconditions: "应用已启动进入首屏（衔接 Step 2 终态；全新安装零项目态）"
  fixture_spec:
    entities:
      - entity_type: "InstallerArtifact"
        min_count: 1
        field_constraints:
          - field: "install_state"
            value: "已安装且启动完成（首屏装载中 → 呈现）"
    state_requirements:
      - description: "全新安装零项目态（用户数据零项目记录——hero 确定相位的 Given）"
        prerequisite_entity: "Project"
- Input: "等待应用首屏呈现"
- Output: "三区工作台骨架可达——左栏导航 rail 入口在位（品牌行 / 新会话 / 知识库 / 设置；零项目态下项目树 + 会话列表呈 rail 空态引导，UF-1 States）；中区呈现 hero 空态 +「＋添加项目」CTA——全新安装零项目时中区的确定相位（UF-2），注册成功后让位于会话视图；右栏 dock 默认收起（轨道归零）"
- State: "工作台三区骨架就位，零项目 hero 相位（安装形态）"
- Side-effect: "none"

## Journey Invariants

- 加载与走查全程无远程资源请求（无远程脚本 / 字体 / 样式拉取）——运行期观察由 Step 2b 行使，安装产物侧由 Step 1 产物检查承载
- 安装形态行为与开发形态一致——机制 = 同一 boot manifest 掌舵装载链路（提案 In Scope M0 定义该装载机制；「安装 ≡ 开发」等价性主张 cited sources 未明文，source: inferred），属审计通道（构建产物链路审查承载），非浏览器可观察断言

## Fixture Specification

本 Contract 前置数据状态：InstallerArtifact（已安装启动完成）＋ 全新安装零项目态。
