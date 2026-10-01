---
journey: "project-registration-projection"
step: 1
step-action: "打开添加项目确认卡"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-registration-projection/journey.md
anchors:
  web:
    page: "添加项目确认卡(C7 浮层)"
    route: "project(左栏 ＋ 原位弹出,不跳页;唯一注册入口)"
    requires_auth: false
    layout: "ConfirmCard(Dialog r24);数据面 = probeProjectPath + registerProject"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-registration-projection / Step 1: 打开添加项目确认卡

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (卡为纯渲染面,打开动作无持久状态) -->

## Outcome "success"
- Preconditions: "应用已启动且项目工作台可用;已有 ≥1 个注册项目(同名同序断言基线)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "codeRoot"
            value: "已注册且路径健康"
- Input: "编排者点击工作台左栏区头「＋」"
- Output: "添加项目确认卡原位弹出(不跳页);唯一必答项 = 代码区文件夹(拖拽/粘贴/浏览三种给定方式);知识区不上卡(M4 不渲染)"
- State: "卡打开;注册表零变更"
- Side-effect: "none"
- Invariants: "C7 确认卡为注册唯一入口(page-map 唯一入口纪律)"

## Journey Invariants

- forge 项目注册表为唯一权威;dsh workspaceRegistry 恒为单向投影(DF001),旅程全程无 dsh→forge 反向写
- 注册硬校验仅 2 条:代码区存在且为目录 + 可读;跨项目唯一(realpath 归一比对)
- 零 git 强制:无 .git 目录为一等公民;任何流程不得以「先 git init」为前置
- 黏性禁令:文档位置默认只由本仓证据决定,不跨项目携带仓内选择
- 投影失败不阻断注册(降级承诺,提供手动重试);健康时同名同序恒成立;投影操作 ≤2s
- 词汇统一「添加项目 / 文档位置」;场景演示 chips 不上产品 UI
