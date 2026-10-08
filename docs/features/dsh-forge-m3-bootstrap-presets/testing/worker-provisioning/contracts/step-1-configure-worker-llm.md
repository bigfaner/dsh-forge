---
journey: "worker-provisioning"
step: 1
step-action: "配置 Forge设置 worker 默认 LLM"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/journey.md
anchors:
  web:
    page: "Forge设置 分区"
    route: ""
    requires_auth: false
    layout: "设置对话框 client-plugin settings.section slot（通用设置下方·多小节结构）"
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: worker-provisioning / Step 1: 配置 Forge设置 worker 默认 LLM

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = 旅程裁决 web 表单原生形态——承载 Outcome "unconfigured-placeholder"（本步 1b：必填缺失 → 保存禁用 + 近场占位说明）与 "save-failure-retry"（1c 姊妹形态）; session-expired = 旅程裁决本地化（配置时效/档位连续性）——承载 Outcome "config-timing-boundary"（本步 1d） -->

## Outcome "success"
- Preconditions: "设置对话框可达；worker 小节三项未配置或可重配置（Provider / Model 联动 / Reasoning 低中高三段）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "forge_settings"
            value: "文件缺席或 worker 段未配置（可配置态）"
- Input: "单人开发者在设置对话框 Forge设置 分区 worker 小节配置默认 LLM 三项（Provider / Model 联动 / Reasoning）并保存"
- Output: "保存成功 → 持久化（用户数据域 forge-settings.json——core forgeSettings 单门读写）、下次派发生效（dispatchTask 实时读，无重启）"
- State: "forge-settings.json 写入 worker 段（原子写——同目录临时文件加改名，崩溃无半写）"
- Side-effect: "设置域写路径（UI 分区与 dispatchTask 同门消费）"

## Outcome "unconfigured-placeholder"
- Preconditions: "worker 小节三项未填齐（必填缺失形态）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "forge_settings"
            value: "worker 段缺席或未填齐（未配置态——文件缺席即未配置）"
- Input: "查看 Forge设置 分区并尝试保存"
- Output: "警示占位说明「worker 派发将回退父会话继承」（显式不静默）+ 保存禁用；填齐激活（脏态实时）——此即 validation-error 的 web 表单原生形态（必填缺失 → 拒绝提交 + 近场占位说明）"
- State: "设置文件不变（未配置态保持）；回退行为 = 父会话继承"
- Side-effect: "none（拒绝形态）"

## Outcome "save-failure-retry"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 1c［UF-2 第 3 条原文「错误行留场可重试」；「已填值不丢失」＝表单控件态独立于持久化结果的合理扩展（源未明文）——持久化失败（如用户数据域不可写）的留场重试形态］ -->
- Preconditions: "持久化写入失败（如用户数据域不可写）"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "user_data_dir"
            value: "不可写（持久化失败注入态）"
- Input: "点保存"
- Output: "错误行留场可重试（不静默丢弃；已填值不丢失）"
- State: "设置文件未写入（失败态）；表单值保持"
- Side-effect: "none（重试通道在场）"

## Outcome "config-timing-boundary"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 1d［「下次派发生效」语义边界（UF-2 第 3 条）：生效时点 = 派发，spawn 后不回溯——agentOptions 在 spawn 时点合成，已 spawn 会话不回改；surface-web session-expired 规则本地化映射（配置时效边界）］ -->
- Preconditions: "一个 worker 已在途（派发时档位 = 旧档）；用户随后改档并保存成功"
  fixture_spec:
    entities:
      - entity_type: "WorkspaceDir"
        min_count: 1
        field_constraints:
          - field: "forge_settings"
            value: "worker 段已改为新档（保存成功）"
      - entity_type: "WorkerSession"
        min_count: 1
        field_constraints:
          - field: "spawned_with"
            value: "旧档 agentOptions（在途——spawn 时点已合成）"
- Input: "查看在途 worker 会话 model，再派发一个新 worker 查看其 model"
- Output: "在途 worker 会话 model 保持旧档（agentOptions 在 spawn 时点合成，已 spawn 会话不回改）；新 worker model = 新档"
- State: "在途会话 model 不变；新派发携带新档 agentOptions"
- Side-effect: "新 worker spawn（新档）"

## Journey Invariants
- worker 永不问用户、不派生子代（全局拒绝集 ask-user / delegation / todo / present 对所有 worker 生效）
- worker 会话 model 恒 = Forge设置 默认档（已配置时——agentOptions 显式携带、优先于父会话继承；未配置回退父会话继承，见 Step 1b）
- worker 技能目录 = 组合继承目录（catalog 行级常驻、内容按需加载——token 纪律）
- 零新装载机制：工具/技能装载走 dsh 既有能力体系（toolFilter 携带者 = run-tasks 派发面 in-process spawn；模型面调用参数不可达）
