---
journey: "session-workbench"
step: 1
step-action: "首屏呈现三区工作台"
generated: "2026-10-03"
sources:
  - docs/features/dsh-forge-p1-mvp/testing/session-workbench/journey.md
anchors:
  web:
    page: "工作台·会话视图（默认态）"
    route: "workbench/session"
    requires_auth: false
    layout: "WorkbenchLayout（左 rail / 中会话面板 / 右 dock）"
last_anchor_sync: "2026-10-03T04:03:45+08:00"
---

# Contract: session-workbench / Step 1: 首屏呈现三区工作台

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: partial（会话列表与 dsh 账本一致性属审计通道——代码审查承载；浏览器侧断言行语言呈现） -->

## Outcome "success"
- Preconditions: "已注册项目甲（含至少一个历史会话）；dsh 会话运行时可用；工作台处于会话视图"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "甲（基准项目）"
      - entity_type: "Session"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "transcript"
            value: "完整（含消息记录，供列表行语言呈现）"
      - entity_type: "DockTab"
        min_count: 1
        field_constraints:
          - field: "scope"
            value: "global（全局页签常驻）"
- Input: "启动应用进入工作台首屏"
- Output: "左栏导航 rail 呈现（品牌行 / 新会话 / 知识库入口 / 项目树 + 会话列表 / 设置入口）；中区会话面板就位；右栏 dock 默认收起（轨道归零）；项目甲会话行以 dsh 行语言呈现（标题 / 状态点 / 相对时间），与 dsh 账本一致（数据来源注记见 Invariant 2）"
- State: "工作台视图态为会话视图、右栏收起（默认）；项目甲节点与会话行在左栏就位"
- Side-effect: "none（首屏读取）"

## Outcome "rail-collapse"
<!-- 溯源: journey Step 1b（左栏收起为 56px rail） -->
- Preconditions: "左栏处于展开态（约 240–420px 展开区间）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "DockTab"
        min_count: 1
        field_constraints:
          - field: "scope"
            value: "global"
- Input: "点收起按钮"
- Output: "左栏折叠为 56px rail——图标保留、悬停提示可用；再展开恢复完整导航"
- State: "侧栏收展态翻转；导航内容与项目树不丢失"
- Side-effect: "none"

## Outcome "zero-project-rail-empty"
<!-- 溯源: journey Step 1c（零项目首用的 rail 空态；依 Setup 场景隔离以全新用户数据目录独立启动） -->
- Preconditions: "应用零项目记录（首用状态；依 Setup 场景隔离独立启动，不与甲/乙基线叠加）"
  fixture_spec:
    entities:
      - entity_type: "DshRuntime"
        min_count: 1
        field_constraints:
          - field: "availability"
            value: "可用（dsh 会话运行时在位）"
    state_requirements:
      - description: "零项目首用状态（projects 表零行；独立用户数据目录启动实现场景隔离）"
        prerequisite_entity: "Project"
- Input: "启动应用查看左栏与中区"
- Output: "rail 呈空态并引导指向中区 hero（UF-2）；中区为 hero 空态 +「＋添加项目」CTA"
- State: "零项目首用相位（左栏空态引导 + 中区 hero）"
- Side-effect: "none"

## Journey Invariants

- 会话面板三页签（对话 / 轨迹 / 知识召回）切换不重置会话状态（规则对三页签整体生效；知识召回 tab 由兄弟 Journey knowledge-recall-flywheel 行使）
- 会话列表呈现与 dsh 账本一致——「实时读、零缓存零副本」为 UF-1 数据契约，属审计通道（代码审查承载），非浏览器可观察断言
- 任何时刻不得出现「知识视图态 + 右栏可见」的状态；隐藏期间右栏状态保留，切回即恢复
- dock 可见页签集恒等于「当前项目页签 + 全局页签」（依 Setup fixture，甲/乙可见集可区分）；切换不打断中区面板
- 会话行点击必须打开对应会话且不重置中区其它视图状态

## Fixture Specification

本 Contract 各 Outcome 的前置数据状态并集：Project（甲）＋ Session（甲的历史会话，belongs_to Project）＋ DockTab（全局页签）；零项目场景以 DshRuntime 在位 + 独立用户数据目录隔离替代（Project 零行）。
