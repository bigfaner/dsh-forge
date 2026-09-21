---
journey: "third-party-template-onboarding"
step: 1
step-action: "照模板新建插件包"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/journey.md
skip_eval: true
state-verification: full
---

# Contract: third-party-template-onboarding / Step 1: 照模板新建插件包

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "工程模板已沉淀(packages/templates/plugin:内建槽位消费/贡献标准姿势与 dsh UI 组件复用约定);模板文档面向第三方用户,不要求读者接触 dsh-forge 仓的 vendored 树;第三方用户本机具备 Node 工具链,可访问 npm registry"
  fixture_spec:
    entities:
      - entity_type: "PluginTemplate"
        min_count: 1
        field_constraints:
          - field: "manifest_form"
            value: "npm-form dependencies, exports[\"./client\"] exposed, empty host half + client half"
      - entity_type: "ThirdPartyWorkstation"
        min_count: 1
        field_constraints:
          - field: "toolchain"
            value: "Node toolchain + npm registry access"
- Input: "从工程模板派生一个新插件包,包名与槽位声明按模板姿势填写(不照抄 workspace 协议 peer 声明,改为 npm 形态)"
- Output: "新包结构成立:空宿主半身 + client 半身(client 半身经 exports[\"./client\"] 暴露,形态参照上游 ui-goal 小包),纯 npm 依赖起包"
- State: "第三方目录下新插件包骨架就绪;与 dsh-forge 仓零耦合"
- Side-effect: "none"
- Invariants: "全程零 vendored 树引用(源与产物),零 dsh-forge 壳代码修改"

## Outcome "workspace-protocol-copied"
<!-- source: journey edge case 1b — Web surface validation-error derivation: 依赖安装第一步的非法输入腿 -->
- Preconditions: "用户未按模板文档把 peer 声明改为 npm 形态,照抄了仓内 workspace 协议声明"
  fixture_spec:
    entities:
      - entity_type: "DerivedPluginPackage"
        min_count: 1
        field_constraints:
          - field: "dependency_spec_form"
            value: "workspace: protocol specs copied verbatim from the in-repo template"
- Input: "在第三方目录执行依赖安装"
- Output: "安装失败或解析悬空被模板文档前置警示拦截(两处「第一步」之一);文档给出明确改法(peer 声明为 npm 形态),用户可纠正后继续"
- State: "纠正后包回到纯 npm 依赖形态"
- Side-effect: "none"

## Journey Invariants

- 全程零 vendored 树引用(源与产物),零 dsh-forge 壳代码修改——第三方插件只经官方 dsh web 的标准插件机制存在
- 对齐线依赖始终 exact 等于 desktopHostVersion,cordis 以独立版本线单列 exact(不与宿主版本比对)
- 模板文档全程不要求读者接触 dsh-forge 仓的 vendored 树
- 插件包体积与构建产物面保持 ui-goal 参照量级(小包)
