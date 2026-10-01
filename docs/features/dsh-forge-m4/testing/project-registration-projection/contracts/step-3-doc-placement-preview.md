---
journey: "project-registration-projection"
step: 3
step-action: "核查文档位置预览行(证据三档门控)"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-registration-projection/journey.md
anchors:
  web:
    page: "添加项目确认卡(C7)·文档位置预览行"
    route: "project(卡内预览行;✎ 展开才见模式+路径)"
    requires_auth: false
    layout: "证据三档:repo-existing(沿用仓内)/ repo-new(仓内新建 docs 懒物化)/ app(应用管理主路径);高级折叠 = custom"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-registration-projection / Step 3: 核查文档位置预览行(证据三档门控)

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (docsPlacement 四值映射落库列可直接核验;FT-130;EvidenceTier FT-132) -->

## Outcome "success"
- Preconditions: "确认卡内给定存在 git 仓的路径,且命中仓内 forge 树特征(docs/features + manifest.md)"
  fixture_spec:
    entities:
      - entity_type: "CodeRoot"
        min_count: 1
        field_constraints:
          - field: "gitRoot"
            value: "顶层 .git 存在"
          - field: "forgeTreeHit"
            value: true
- Input: "编排者察看文档位置预览行,展开 ✎ 查看模式与路径"
- Output: "预选 = 沿用仓内 forge 树(repo-existing);✎ 展开才见模式+路径;过程留痕灰字告知;三档门控(仓内 forge 树命中 = 沿用仓内 / 有 .git = 仓内新建 root 下 docs 懒物化 / 无 .git = 应用管理主路径)"
- State: "预选仅由本仓证据决定;注册表零变更"
- Side-effect: "none"
- Invariants: "黏性禁令:预选只由本仓证据决定"

## Outcome "reprobe-reevaluate"
<!-- source: inferred -->
<!-- reasoning: journey Step 3b(黏性禁令);侦测为逐路径纯计算(DetectReport 按入参重算,FT-131),换路径即换证据 -->
- Preconditions: "已在卡内察看过路径 P1 的文档位置预选,再更换为证据不同的路径 P2"
  fixture_spec:
    entities:
      - entity_type: "CodeRoot"
        min_count: 2
        field_constraints:
          - field: "evidence"
            value: "P1 与 P2 证据形态不同(如 P1 命中仓内 forge 树、P2 仅 .git)"
- Input: "编排者在卡内给定新路径 P2"
- Output: "预览行预选仅由 P2 的本仓证据决定,换路径即重估;无跨项目黏性(仓内选择不跨项目携带)"
- State: "预选随新证据重算;无任何跨项目携带的持久预选"
- Side-effect: "none"

## Outcome "custom-outside-authorization"
- Preconditions: "用户展开高级折叠,自定义文档路径位于代码根之外"
  fixture_spec:
    entities:
      - entity_type: "CodeRoot"
        min_count: 1
      - entity_type: "DocLocation"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "CodeRoot"
        field_constraints:
          - field: "path"
            value: "位于代码根之外(仓外)"
          - field: "authorized"
            value: "未登记授权"
- Input: "编排者输入仓外自定义路径"
- Output: "呈现显式授权行(仓外需授权);未授权不可用;仓外授权收窄至高级自定义(BIZ-001/003)"
- State: "custom 位需授权在案方可使用;未授权时零落位"
- Side-effect: "授权确认经 authorizeExternalDocPath 落 app_state(唯一仓外授权写入面)"
- Invariants: "仓外授权收窄至高级自定义;custom 复检 = 授权在案 + 可读 + 冲突比对(FT-130)"

## Journey Invariants

- forge 项目注册表为唯一权威;dsh workspaceRegistry 恒为单向投影(DF001),旅程全程无 dsh→forge 反向写
- 注册硬校验仅 2 条:代码区存在且为目录 + 可读;跨项目唯一(realpath 归一比对)
- 零 git 强制:无 .git 目录为一等公民;任何流程不得以「先 git init」为前置
- 黏性禁令:文档位置默认只由本仓证据决定,不跨项目携带仓内选择
- 投影失败不阻断注册(降级承诺,提供手动重试);健康时同名同序恒成立;投影操作 ≤2s
- 词汇统一「添加项目 / 文档位置」;场景演示 chips 不上产品 UI
