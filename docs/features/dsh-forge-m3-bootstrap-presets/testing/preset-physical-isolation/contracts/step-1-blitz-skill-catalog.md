---
journey: "preset-physical-isolation"
step: 1
step-action: "突击会话枚举技能目录"
generated: "2026-10-08"
sources:
  - docs/features/dsh-forge-m3-bootstrap-presets/testing/preset-physical-isolation/journey.md
anchors:
  web:
    page: ""
    route: ""
    requires_auth: false
    layout: ""
last_anchor_sync: "2026-10-08T05:52:31Z"
---

# Contract: preset-physical-isolation / Step 1: 突击会话枚举技能目录

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = N/A（旅程裁决：核查型观测工作流无用户表单交互面——本地化派生承载步 = Step 2b/3b，见 step-2/step-3 合约）; session-expired = N/A（旅程裁决：核查对象为本地静态产物，无会话过期路径；最邻近连续性边界由 mode-selection-alignment Step 3c 承载——旅程分工声明） -->

## Outcome "success"
- Preconditions: "突击会话已创建（组合 = 突击预设——customSkillDirs 仅含 plugin-forge 技能目录）；会话技能目录经会话系统提示投影可转录"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "blitz（customSkillDirs = plugin-forge 技能目录 only）"
- Input: "单人开发者创建突击会话并转录其技能目录（会话系统提示中的技能目录清单）"
- Output: "目录不含规格技能全集——write-prd / ui-design / tech-design / gen-journeys / gen-contracts / gen-test-scripts / breakdown-tasks 七者零在场（突击目录物理缺 spec 技能）；阳性对照在场：核心包技能行可见（run-tests / brainstorm / run-tasks / submit-task）——枚举通道有效性由此证明，缺席断言不空洞通过"
- State: "会话组合状态不变（只读转录）"
- Side-effect: "none"
- Invariants: "物理边界 = 枚举面即证（突击侧边界证明无需运行期探测）"

## Outcome "expedition-catalog-contrast"
- Preconditions: "远征会话已创建（默认或显式——customSkillDirs 含 plugin-forge 与 plugin-forge-spec 两目录）"
  fixture_spec:
    entities:
      - entity_type: "Session"
        min_count: 1
        field_constraints:
          - field: "composition"
            value: "expedition"
- Input: "转录远征会话技能目录并尝试 brainstorm"
- Output: "规格技能全集七者可见且 brainstorm 可用（对照面——物理隔离只作用于突击组合；跨会话阳性对照）"
- State: "会话状态不变；brainstorm 行使正常"
- Side-effect: "brainstorm 技能行使（会话内探索动作）"

## Journey Invariants
- 模式边界靠机制不靠提示词纪律：物理调不到（目录物理缺），而非「被叮嘱不要」
- 物理边界 = 枚举面即证：突击侧边界证明无需运行期探测（远征侧对照 Step 1b 含 brainstorm 行使，属对照面而非边界证明通道）
- 双预设镜像不随上游演进漂移：契约面清单 + 机械 diff 跟踪（含行 config 全集义务；diff 基线版本钉扎）
- !!js 表达式形态全形态死刑；customSkillDirs 恒物化绝对路径
