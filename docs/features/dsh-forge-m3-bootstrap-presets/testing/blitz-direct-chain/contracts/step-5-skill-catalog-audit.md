---
journey: "blitz-direct-chain"
step: 5
step-action: "全程核查技能清单"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/blitz-direct-chain/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: blitz-direct-chain / Step 5: 全程核查技能清单

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（核查型观测步，无表单交互面）; session-expired = N/A（断言对象为会话系统提示静态投影，无会话凭据路径；重启投影重建由 mode-selection-alignment Step 3c 承载——旅程分工） -->

## Outcome "success"
- Preconditions: "突击会话已创建并运行（组合 = 突击预设；技能目录经会话系统提示投影可转录）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "blitz（customSkillDirs 仅含 plugin-forge 技能目录——M3_PRESET_BLITZ_SKILL_DIRS）"
- Input: "单人开发者（或断言通道）枚举突击会话全程的技能清单（会话系统提示技能目录转录）"
- Output: "全程技能清单不含任何规格技能（write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks 七者零在场）；阳性对照在场：核心包技能行可见（run-tests / brainstorm / run-tasks / submit-task）"
- State: "会话组合状态不变（只读核查）"
- Side-effect: "none"
- Invariants: "枚举通道有效性由阳性对照证明——缺席断言不空洞通过；物理边界（目录物理缺 spec 探针，spike S6-3 同构实证）"

## Outcome "spec-skill-request-physically-invisible"
- Preconditions: "突击会话运行期（请求态——尝试调用而非枚举，含 blank 期后任意时点）；规格技能目录物理不在组合内"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "blitz（spec 技能目录物理缺位）"
- Input: "尝试在突击会话中调用任一规格技能（如 write-prd）"
- Output: "物理不可见（技能枚举断言即证——目录物理缺 spec 探针）；非提示词劝阻"
- State: "会话状态不变；无规格技能加载"
- Side-effect: "none"
- Invariants: "模式边界靠机制不靠提示词纪律（物理调不到，而非被叮嘱不要）"

## Journey Invariants
- 突击链 gate 纪律不折扣：单写路径 / 执行记录 / 提交规范 / 验证门原样
- 任务语义由 mode 溯源（blitz）决定：整数 ID / 无 stage-gate / eval 门豁免
- 突击无 feature 阶段：提案与任务之外无中间层
- 概览三视图即时口径：写入返回后单次重取即见新值
