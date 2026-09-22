---
journey: "third-party-template-onboarding"
step: 3
step-action: "构建插件包"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/journey.md
skip_eval: true
state-verification: full
---

# Contract: third-party-template-onboarding / Step 3: 构建插件包

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "依赖声明就绪(Step 2 通过,全部 npm 形态 exact);模板构建流程可执行(tsc --build + tsdown);上游 ui-goal 参照量级可知"
  fixture_spec:
    entities:
      - entity_type: "DerivedPluginPackage"
        min_count: 1
        field_constraints:
          - field: "dependency_form"
            value: "all npm-form exact, engines declared"
      - entity_type: "ReferencePackage"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "upstream ui-goal (artifact size/shape reference)"
- Input: "执行模板的构建流程产出插件构建产物"
- Output: "构建成功;产物级模块来源校验绿灯——任何模块不解析至 dsh-forge 仓 vendor/ 树(零 vendored 文件引用);包体积与产物面保持上游 ui-goal 参照量级"
- State: "构建产物(lib/index.js、lib/client.js、类型与 cordis.patch.yml)在第三方目录生成,可交付安装"
- Side-effect: "none"
- Invariants: "产物模块来源零 vendored 树引用"

## Outcome "build-failure-diagnostics"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-021/FT-026(模板/插件构建链 = tsc --build + tsdown,产物契约 lib/index.js + lib/client.js + types + cordis.patch.yml)——第三方首建时类型错误/入口路径错误是现实边界,失败须可诊断而非静默半产物 -->
- Preconditions: "包源码存在类型错误或入口路径与模板契约不符(如 client 入口未按 exports[\"./client\"] 形态组织)"
  fixture_spec:
    entities:
      - entity_type: "DerivedPluginPackage"
        min_count: 1
        field_constraints:
          - field: "source_state"
            value: "type errors or entry layout violating the template artifact contract"
- Input: "执行模板的构建流程"
- Output: "构建失败且诊断信息指向具体错误(类型错误/入口路径),不产出半成品产物集;用户按诊断修正后重跑可成功"
- State: "无半构建产物被当作交付件;修正后产物集完整"
- Side-effect: "none"

## Journey Invariants

- 全程零 vendored 树引用(源与产物),零 dsh-forge 壳代码修改——第三方插件只经官方 dsh web 的标准插件机制存在
- 对齐线依赖始终 exact 等于 desktopHostVersion,cordis 以独立版本线单列 exact(不与宿主版本比对)
- 模板文档全程不要求读者接触 dsh-forge 仓的 vendored 树
- 插件包体积与构建产物面保持 ui-goal 参照量级(小包)
