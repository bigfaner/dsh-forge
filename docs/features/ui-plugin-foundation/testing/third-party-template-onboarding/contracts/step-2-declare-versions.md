---
journey: "third-party-template-onboarding"
step: 2
step-action: "声明宿主版本兼容与对齐线依赖"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/journey.md
skip_eval: true
state-verification: full
---

# Contract: third-party-template-onboarding / Step 2: 声明宿主版本兼容与对齐线依赖

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "新包骨架已成立(Step 1 通过);模板文档的版本声明姿势可知(engines 式宿主兼容 + exact 对齐线);模板版本戳经同源机制可见"
  fixture_spec:
    entities:
      - entity_type: "DerivedPluginPackage"
        min_count: 1
        field_constraints:
          - field: "engines"
            value: "engines[\"@deepseek-ai/dsh\"] declared exact"
          - field: "alignment_deps"
            value: "every @deepseek-ai/dsh-client-* dependency exact, cordis exact on its own line"
      - entity_type: "PluginTemplate"
        min_count: 1
        field_constraints:
          - field: "version_stamp"
            value: "visible via the same-source mechanism as the assertion gate"
- Input: "按模板文档声明 engines 式宿主版本兼容性,并把对齐线依赖(@deepseek-ai/dsh-client-* 宿主契约族)锁为 exact 版本(cordis peer 按独立版本线单列 exact)"
- Output: "依赖声明全部 npm 形态且 exact;模板版本戳与 vendored 锁基准(desktopHostVersion)同步可见;无裸包名、无 ^ 范围、无可变 tag 直写"
- State: "包清单(package.json)的依赖面与 engines 声明就绪,可过版本断言"
- Side-effect: "none"
- Invariants: "对齐线依赖 exact ≡ desktopHostVersion;cordis 独立版本线单列"

## Outcome "dist-tag-trap"
<!-- source: journey edge case 2b — Web surface validation-error derivation: 版本声明输入腿 -->
- Preconditions: "用户用裸包名或 ^ 声明对齐线依赖——npm latest dist-tag 停在旧版 0.0.1-rc.1,现行线在 alpha tag"
  fixture_spec:
    entities:
      - entity_type: "DerivedPluginPackage"
        min_count: 1
        field_constraints:
          - field: "alignment_deps"
            value: "bare name or ^ range on an @deepseek-ai/dsh-client-* dependency"
- Input: "安装依赖或运行版本断言"
- Output: "版本一致性断言红灯拦截(静默契约漂移变显式红灯);模板文档明示禁裸包名/^,用户改为 exact(借 alpha tag 定位须解析并锁定为 exact 结果)后通过"
- State: "纠正后依赖面回到 exact 形态,断言回绿"
- Side-effect: "none"

## Outcome "missing-engines"
<!-- source: journey edge case 2c — Web surface validation-error derivation: 装进宿主第一步缺失腿 -->
- Preconditions: "用户跳过宿主版本兼容性声明(装进宿主「第一步」缺失)"
  fixture_spec:
    entities:
      - entity_type: "DerivedPluginPackage"
        min_count: 1
        field_constraints:
          - field: "engines"
            value: "missing engines[\"@deepseek-ai/dsh\"] host compatibility declaration"
- Input: "把插件装进宿主版本不匹配的 dsh web"
- Output: "安装期或装配期出现可见的版本兼容提示/错误,用户补齐 engines 式声明后可重试;不静默装入不兼容宿主"
- State: "补齐后装配可在匹配宿主上重试成功"
- Side-effect: "none"

## Journey Invariants

- 全程零 vendored 树引用(源与产物),零 dsh-forge 壳代码修改——第三方插件只经官方 dsh web 的标准插件机制存在
- 对齐线依赖始终 exact 等于 desktopHostVersion,cordis 以独立版本线单列 exact(不与宿主版本比对)
- 模板文档全程不要求读者接触 dsh-forge 仓的 vendored 树
- 插件包体积与构建产物面保持 ui-goal 参照量级(小包)
