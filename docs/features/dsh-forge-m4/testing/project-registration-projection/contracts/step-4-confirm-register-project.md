---
journey: "project-registration-projection"
step: 4
step-action: "确认添加项目"
generated: "2026-09-30"
sources:
  - docs/features/dsh-forge-m4/testing/project-registration-projection/journey.md
anchors:
  web:
    page: "添加项目确认卡(C7)·确认动作"
    route: "project(卡内「添加项目」按钮)"
    requires_auth: false
    layout: "registerProject(BEGIN IMMEDIATE)→ 投影期望 push(projection_push_required)→ relay 执行序 ensure→rename→reorder→delete"
last_anchor_sync: "2026-09-30T00:00:00Z"
---

# Contract: project-registration-projection / Step 4: 确认添加项目

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full (注册表行 + workspace 同名同序两侧可读;投影状态机 FT-123;注错缝 DSH_FORGE_PROJECTION_FAULTS FT-128) -->

## Outcome "success"
- Preconditions: "卡处于 valid/nogit 态,给定路径通过两条硬校验(存在+目录+可读;跨项目唯一)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "codeRoot"
            value: "另一既有项目(同名同序断言基线)"
      - entity_type: "CodeRoot"
        min_count: 1
        field_constraints:
          - field: "probe"
            value: "valid 态(git 仓)或 nogit 态,未注册"
    state_requirements:
      - description: "dsh 侧 workspaceRegistry 投影通道就绪可写"
        prerequisite_entity: "Workspace"
- Input: "编排者点击「添加项目」"
- Output: "注册写入 forge 项目注册表(权威条目);投影写入 dsh workspaceRegistry 同名条目且顺序与项目列表一致(断言);投影操作同步完成 ≤2s"
- State: "forge 注册表新增行;dsh workspaceRegistry 新增同名条目、顺序一致;投影状态 healthy"
- Side-effect: "单向投影写(ensure/reorder,禁反向);project_list_changed + projection_push_required 事件推送"
- Invariants: "forge 注册表为唯一权威;恒无 dsh→forge 反向写"

## Outcome "projection-write-failure"
<!-- source: journey Step 4b -->
<!-- reasoning: 必答④降级承诺;通道缺席/写入失败 → degraded + ERR_PROJECTION_CHANNEL_UNAVAILABLE/ERR_PROJECTION_OP_FAILED,plan 保留可重试(FT-126/FT-127);e2e 注错缝 DSH_FORGE_PROJECTION_FAULTS(FT-128) -->
<!-- surface-web required_outcomes 映射:network-error → 投影通道(host 半身)写入失败,呈现为降级态 + 手动重试入口,注册数据无丢失 -->
- Preconditions: "workspaceRegistry 不可写或投影写入失败(投影通道注错:channel unavailable 或上游 op 失败)"
  fixture_spec:
    entities:
      - entity_type: "CodeRoot"
        min_count: 1
        field_constraints:
          - field: "probe"
            value: "valid 态,未注册"
    state_requirements:
      - description: "投影通道注错(DSH_FORGE_PROJECTION_FAULTS 控制文件生效,channel unavailable)"
        prerequisite_entity: "Workspace"
- Input: "编排者点击「添加项目」,恢复通道后点击重试投影"
- Output: "注册不被阻断(本地权威条目已写),降级为无投影继续运行(归属仅 forge 侧可见)+ 可重试提示(e2e 断言);恢复后重试成功即两侧一致;不静默失败"
- State: "forge 注册表行存在;投影状态 degraded(last_error 落表),plan 保留;重试成功后转 healthy 且同名同序"
- Side-effect: "降级仅影响提示面,期望状态在库(幂等全量重推收敛)"
- Invariants: "投影失败不阻断注册(降级承诺,提供手动重试)"

## Outcome "writability-runtime-recheck"
<!-- source: journey Step 4c -->
<!-- reasoning: 可写性为运行时状态而非注册门槛(FT-131 readable 为侦测事实、FT-129 硬校验仅 2 条);降级呈现不回滚注册 -->
- Preconditions: "注册完成后,运行时探测代码区/文档位置不可写(注册后磁盘状态变化)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "status"
            value: "已注册成功"
    state_requirements:
      - description: "注册后运行时探测代码区/文档位置不可写"
        prerequisite_entity: "Project"
- Input: "编排者察看项目行/投影状态呈现"
- Output: "可写性为运行时状态(非注册门槛):呈现降级状态与提示,不回滚注册"
- State: "注册条目保持;可写性以降级状态呈现"
- Side-effect: "none"

## Journey Invariants

- forge 项目注册表为唯一权威;dsh workspaceRegistry 恒为单向投影(DF001),旅程全程无 dsh→forge 反向写
- 注册硬校验仅 2 条:代码区存在且为目录 + 可读;跨项目唯一(realpath 归一比对)
- 零 git 强制:无 .git 目录为一等公民;任何流程不得以「先 git init」为前置
- 黏性禁令:文档位置默认只由本仓证据决定,不跨项目携带仓内选择
- 投影失败不阻断注册(降级承诺,提供手动重试);健康时同名同序恒成立;投影操作 ≤2s
- 词汇统一「添加项目 / 文档位置」;场景演示 chips 不上产品 UI
