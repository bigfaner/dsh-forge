---
journey: "preset-physical-isolation"
step: 3
step-action: "检查预设行装配的 customSkillDirs"
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

# Contract: preset-physical-isolation / Step 3: 检查预设行装配的 customSkillDirs

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = 旅程裁决本地化（配置面形态）——承载 Outcome "js-expression-broken"（本步 3b：!!js 形态 → 装配校验拒绝且不静默）; session-expired = N/A（旅程裁决：无会话凭据路径——核查对象为 YAML 内省静态产物） -->

## Outcome "success"
- Preconditions: "双预设行已物化（boot overlay 每启由底稿重写注行——预设声明行宿主）"
  fixture_spec:
    entities:
      - entity_type: "PresetRow"
        min_count: 2
        field_constraints:
          - field: "host_file"
            value: "用户数据目录下 boot overlay（每启由三底稿重写——产品工件）"
- Input: "检查预设行的 customSkillDirs 装配形态（YAML 内省——契约面步骤）"
- Output: "一律物化绝对路径（!!js 表达式形态零在场——spike 裁决全形态死刑）"
- State: "物化产物状态不变（只读内省）"
- Side-effect: "none"
- Invariants: "customSkillDirs 恒物化绝对路径——物化输出零表达式残留"

## Outcome "js-expression-broken"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 3b + Setup 故障注入规程［底稿 customSkillDirs 误用 !!js 表达式形态 → packaged-js 负对照（3.9 补验实证：!!js 行 broken）——不上菜单、不静默降级；surface-web validation-error 本地化映射（无效配置 → 拒绝且不静默）］ -->
- Preconditions: "预设底稿 customSkillDirs 处于误用 !!js 表达式的形态（非物化路径——Setup 故障注入规程造成）"
  fixture_spec:
    entities:
      - entity_type: "PresetDraft"
        min_count: 1
        field_constraints:
          - field: "custom_skill_dirs"
            value: "!!js 表达式形态（非物化路径）"
- Input: "以该底稿物化装配并启动"
- Output: "该预设 broken 确认（packaged-js 负对照——3.9 补验实证：!!js 行 broken）；不上菜单、不静默降级"
- State: "该预设不出现在预设菜单枚举面；装配失败形态可查（契约面）"
- Side-effect: "none（拒绝形态）"

## Journey Invariants
- 模式边界靠机制不靠提示词纪律：物理调不到（目录物理缺），而非「被叮嘱不要」
- 物理边界 = 枚举面即证：突击侧边界证明无需运行期探测（远征侧对照 Step 1b 含 brainstorm 行使，属对照面）
- 双预设镜像不随上游演进漂移：契约面清单 + 机械 diff 跟踪（含行 config 全集义务；diff 基线版本钉扎）
- !!js 表达式形态全形态死刑；customSkillDirs 恒物化绝对路径
