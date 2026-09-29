---
journey: "project-registration-projection"
step: 5
step-action: "验证派发会话归组"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-registration-projection/journey.md
anchors:
  web:
    page: "dsh 原生会话列表(workspace 分组;经项目工作台·左栏项目树会话行核验)"
    route: "project(左栏 C3 会话行归组呈现)"
    requires_auth: false
    layout: "dsh workspaceRegistry 按 canonical path 幂等 create、cwd 自动归组(上游权威语义)"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-registration-projection / Step 5: 验证派发会话归组

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (workspaceRegistry 幂等 create + cwd 自动归组;断言经 dsh 原生 UI/数据面) -->

## Outcome "success"
- Preconditions: "项目已注册且投影 healthy(workspace 同名条目在位);另存在一个未注册目录"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "projectionState"
            value: "healthy"
      - entity_type: "Workspace"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "name"
            value: "与项目同名(投影一致)"
      - entity_type: "Session"
        min_count: 2
        field_constraints:
          - field: "cwd"
            value: "其一 = 已注册项目代码根,其二 = 未注册目录"
- Input: "编排者经该项目 cwd 派发会话,在 dsh 原生 UI 查看会话列表"
- Output: "该会话归组到对应同名 workspace(断言);不落入「未分组」;未注册目录的既有会话仍显示为未分组(不破坏)"
- State: "会话归组随 workspace 建立即生效;既有未分组会话不受影响"
- Side-effect: "none"
- Invariants: "未注册目录既有会话仍显示未分组(不破坏)"

## Journey Invariants

- forge 项目注册表为唯一权威;dsh workspaceRegistry 恒为单向投影(DF001),旅程全程无 dsh→forge 反向写
- 注册硬校验仅 2 条:代码区存在且为目录 + 可读;跨项目唯一(realpath 归一比对)
- 零 git 强制:无 .git 目录为一等公民;任何流程不得以「先 git init」为前置
- 黏性禁令:文档位置默认只由本仓证据决定,不跨项目携带仓内选择
- 投影失败不阻断注册(降级承诺,提供手动重试);健康时同名同序恒成立;投影操作 ≤2s
- 词汇统一「添加项目 / 文档位置」;场景演示 chips 不上产品 UI
