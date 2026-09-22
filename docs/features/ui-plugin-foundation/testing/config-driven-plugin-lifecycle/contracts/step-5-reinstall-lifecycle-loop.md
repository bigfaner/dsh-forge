---
journey: "config-driven-plugin-lifecycle"
step: 5
step-action: "复装条目验证生命周期闭环"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/journey.md
skip_eval: true
state-verification: full
---

# Contract: config-driven-plugin-lifecycle / Step 5: 复装条目验证生命周期闭环

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "Step 4 已完成(hello-world 条目被删除且物化已清理/失效);产品级配置可再次编辑;预播种工件或闭包解析源仍可用"
  fixture_spec:
    entities:
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "entry removed in step 4, staging/closure source still available"
      - entity_type: "UserDataProfileProjection"
        min_count: 1
        field_constraints:
          - field: "hello_world_materialization"
            value: "cleaned up or invalidated"
- Input: "用户把 hello-world 条目重新加回产品级配置并再次启动壳"
- Output: "物化重建、插件重新装配、面板重新渲染,呈现与首次装配一致;清理不留下永久残留状态——配置增删是可重复的生命周期操作"
- State: "profile bundle manifest 重新含 hello-world(配置顺序);物化重建(种子标记重写);其余条目不受影响;壳代码 diff 在整个增删循环中保持为 0"
- Side-effect: "userData profile 重新写入该条目物化"
- Invariants: "生命周期闭环:加 → 生效 → 删 → 清理 → 再加 → 再生效"

## Outcome "repeated-cycle-idempotent"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-017/FT-018(host-profile/index.ts: 调和幂等、种子标记使重跑幂等)——多次增删循环是「可重复生命周期操作」的直接推论,须验证无累积残留 -->
- Preconditions: "同一 profile 已经历至少两轮完整的增删循环(加 → 启动 → 删 → 启动)"
  fixture_spec:
    entities:
      - entity_type: "UserDataProfileProjection"
        min_count: 1
        field_constraints:
          - field: "add_remove_cycles"
            value: ">= 2 completed cycles"
- Input: "用户再次执行一轮增删并启动壳"
- Output: "每轮结果与首轮一致:装配/清理均按配置收敛,无累积残留目录、无重复 manifest 条目、无孤儿种子标记"
- State: "profile 状态与「从未经历过循环再执行当前配置」的期望状态等价"
- Side-effect: "none"

## Outcome "marker-orphan-converge"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-018(host-profile/index.ts: 种子标记携带工件 sha256,重跑幂等、sha 漂移收敛)——若删除腿清理异常遗留孤儿种子标记,复装须靠 sha 比对收敛而非被旧标记卡住「存在即跳过」 -->
- Preconditions: "删除腿清理异常遗留孤儿种子标记 .dsh-forge-seed.json(物化目录部分移除),条目随后被加回配置"
  fixture_spec:
    entities:
      - entity_type: "UserDataProfileProjection"
        min_count: 1
        field_constraints:
          - field: "seed_marker_state"
            value: "orphaned marker left by a partially failed cleanup"
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "entry re-added after the partial cleanup"
- Input: "用户启动壳触发复装调和"
- Output: "孤儿标记被识别并收敛——物化按当前配置重建、种子标记重写为正确 sha256;不因旧标记存在而错误跳过重建"
- State: "该条目物化与种子标记恢复一致态;无半重建残留"
- Side-effect: "none"

## Journey Invariants

- 配置增删两次操作的壳代码 diff = 0(配置是插件树唯一事实源,壳代码常量清单不得回归)
- 产品清单条目对运行时启停只读(产品级配置不被第二写入方破坏)
- 对账/调和只做清理与失效,不发明旁路装配通道(dsh 插件机制为唯一装配机制)
- 配置化改动不引入壳启动回归(冷启动预算内),M1 验收面(SC7/SC9)保持绿
- 离线自足、进程足迹 = 2、无监听端口等 M1 NFR 在增删全程不被破坏
