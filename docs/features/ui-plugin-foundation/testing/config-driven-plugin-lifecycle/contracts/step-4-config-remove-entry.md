---
journey: "config-driven-plugin-lifecycle"
step: 4
step-action: "从产品级配置中删除 hello-world 条目并重启触发对账"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/journey.md
skip_eval: true
state-verification: full
---

# Contract: config-driven-plugin-lifecycle / Step 4: 从产品级配置中删除 hello-world 条目并重启触发对账

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "产品级配置刚移除 hello-world 条目;userData profile 中该条目仍有既有物化(Step 2 产物);对账策略已按 tech-design 裁决落档(默认回退 = 壳侧启动期差集调和)"
  fixture_spec:
    entities:
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "valid config without @dsh-forge/plugin-hello-world"
      - entity_type: "MaterializedBundle"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "UserDataProfileProjection"
        field_constraints:
          - field: "name"
            value: "@dsh-forge/plugin-hello-world"
- Input: "用户编辑产品级配置移除 hello-world 条目并重新启动壳(触发启动期差集调和)"
- Output: "该条目的既有物化被清理/失效(行为结果验收:hello-world 不再装配、面板不再渲染);清理不触碰上游自有的 .dsh-module-fallback/ 链接;壳代码 diff 仍为 0"
- State: "profile bundle manifest 不再含 hello-world;其 profile 局部物化被移除或失效;其余条目物化不受影响"
- Side-effect: "userData profile 目录删除该条目物化文件;git 工作区仍仅配置文件变更"
- Invariants: "调和只做清理/失效,不新增装配通道"

## Outcome "no-legal-cleanup-channel"
<!-- source: journey edge case 4b -->
- Preconditions: "对账策略两候选(壳侧启动期差集调和 / 上游原生移除通道)均不可行或裁决未落档"
  fixture_spec:
    entities:
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "config without the entry while the profile still materializes it"
      - entity_type: "ReconciliationPolicyRecord"
        min_count: 1
        field_constraints:
          - field: "status"
            value: "no viable mechanism or decision not archived"
- Input: "用户执行删除条目并重启壳"
- Output: "按已落档裁决执行清理/失效;若两项机制均不可行,视为 spike 推翻假设同款错误路径——修正路线落档并同步修订 SC2 删除腿口径,不带病开工;不允许静默残留已删条目继续装配"
- State: "不出现「配置已删但面板仍渲染」的静默残留态;错误路径与修正路线进入落档通道"
- Side-effect: "spike 同款错误路径的修正记录落档"

## Outcome "runtime-writer-rejected"
<!-- source: journey edge case 4c -->
- Preconditions: "壳正在运行;运行时启停(M2 UF6 预留)或其他写入方试图修改产品级配置的产品清单条目"
  fixture_spec:
    entities:
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "ownership"
            value: "product-owned, read-only to runtime writers"
      - entity_type: "RuntimeEnableDisableWriter"
        min_count: 1
        field_constraints:
          - field: "intent"
            value: "mutate a product-owned manifest entry while shell is running"
- Input: "用户在壳运行中触发对产品清单条目的写操作"
- Output: "写操作被拒绝或不生效,拒绝可见或可诊断;产品清单不被第二写入方破坏"
- State: "产品级配置文件内容保持不变;无第二事实源产生"
- Side-effect: "none"

## Outcome "reconciliation-overreach"
<!-- source: journey edge case 4d -->
- Preconditions: "壳侧差集调和实现被扩展为不只做清理/失效,还引入新的装配来源(越界实现待审查)"
  fixture_spec:
    entities:
      - entity_type: "ReconciliationImplementation"
        min_count: 1
        field_constraints:
          - field: "behavior"
            value: "adds an assembly source beyond cleanup/invalidation"
- Input: "用户审查对账实现与「不发明旁路」约束的相容性(代码审查/行为核查)"
- Output: "判为缺陷——调和只做清理/失效;内置(profile bundle 清单)与运行时(dsh plugin add)仍须走 dsh 插件机制同一通道;审查结论可归因到越界点"
- State: "越界实现不被合入;修正后装配通道保持唯一"
- Side-effect: "none"

## Journey Invariants

- 配置增删两次操作的壳代码 diff = 0(配置是插件树唯一事实源,壳代码常量清单不得回归)
- 产品清单条目对运行时启停只读(产品级配置不被第二写入方破坏)
- 对账/调和只做清理与失效,不发明旁路装配通道(dsh 插件机制为唯一装配机制)
- 配置化改动不引入壳启动回归(冷启动预算内),M1 验收面(SC7/SC9)保持绿
- 离线自足、进程足迹 = 2、无监听端口等 M1 NFR 在增删全程不被破坏
