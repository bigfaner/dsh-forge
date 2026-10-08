---
journey: "preset-physical-isolation"
step: 2
step-action: "机械 diff 双预设 standard 基础行"
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

# Contract: preset-physical-isolation / Step 2: 机械 diff 双预设 standard 基础行

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- web-surface-required adjudication: validation-error = 旅程裁决本地化（配置面形态）——承载 Outcome "mirror-config-missing-broken"（本步 2b：无效配置数据 → 装配校验拒绝且不静默）; session-expired = N/A（旅程裁决：无会话凭据路径——核查对象为文件级静态产物） -->

## Outcome "success"
- Preconditions: "上游基线已钉扎（一份与被测安装同版本的 dsh 上游 checkout 在场——其 standard.patch.yml 为机械 diff 基线）；双预设已物化"
  fixture_spec:
    entities:
      - entity_type: "UpstreamCheckout"
        min_count: 1
        field_constraints:
          - field: "version"
            value: "与被测安装同版本（dsh 0.x-rc next 线精确锁定——proposal NFR）"
      - entity_type: "PresetRow"
        min_count: 2
        field_constraints:
          - field: "materialized"
            value: "expedition 与 blitz（boot overlay 物化产物在场）"
- Input: "将两预设的 standard 基础行与上游 standard.patch.yml 机械 diff"
- Output: "一致（镜像行契约）；镜像行含必填 config 全集（如 tool-fs-search 的 sampleOverCapGlobResults 键在场）"
- State: "文件系统状态不变（只读 diff）；物化产物与上游基线逐字一致"
- Side-effect: "none（契约面文件级 diff——显式记为 Contract 面步骤，非浏览器交互步）"
- Invariants: "版本错位会使 diff 产出假阳性漂移——基线钉扎是判定效力的前置"

## Outcome "mirror-config-missing-broken"
<!-- source: inferred -->
<!-- reasoning: 旅程 Step 2b + Setup 故障注入规程［注入靶 = 预设底稿（presets/expedition|blitz.patch.yml 产品工件）——唯一持久故障源，物化产物每启由底稿重写忠实重现损坏；「broken 不上菜单」+「不静默降级」＝ broken 缺席即显式失败形态的否定式注记；surface-web validation-error 本地化映射（无效配置 → 拒绝且不静默）］ -->
- Preconditions: "预设底稿的 standard 镜像行处于缺失某必填 config 的不完整态（Setup 故障注入规程造成——底稿为唯一持久故障源）"
  fixture_spec:
    entities:
      - entity_type: "PresetDraft"
        min_count: 1
        field_constraints:
          - field: "mirror_row_config"
            value: "缺失某必填 config（不完整态——模拟上游演进新增、镜像未跟进）"
- Input: "以该底稿物化装配并启动应用，查看 hero 预设菜单"
- Output: "整预设 broken 不上菜单（缺 config → 装配校验拒绝——schema 拒绝；契约面清单含 config 全集义务兜底）；拒绝形态显式可见，无静默降级"
- State: "该预设不出现在预设菜单枚举面（SC1 菜单枚举面缺席）；装配校验拒绝原因可查（契约面）"
- Side-effect: "none（拒绝形态——无半装配产物上菜单）"

## Journey Invariants
- 模式边界靠机制不靠提示词纪律：物理调不到（目录物理缺），而非「被叮嘱不要」
- 物理边界 = 枚举面即证：突击侧边界证明无需运行期探测
- 双预设镜像不随上游演进漂移：契约面清单 + 机械 diff 跟踪（含行 config 全集义务；diff 基线版本钉扎）
- !!js 表达式形态全形态死刑；customSkillDirs 恒物化绝对路径
