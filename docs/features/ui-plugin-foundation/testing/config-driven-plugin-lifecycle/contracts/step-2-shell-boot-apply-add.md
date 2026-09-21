---
journey: "config-driven-plugin-lifecycle"
step: 2
step-action: "启动壳验证新增条目生效"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/journey.md
skip_eval: true
state-verification: partial
---

# Contract: config-driven-plugin-lifecycle / Step 2: 启动壳验证新增条目生效

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "产品级配置已含 hello-world 条目且 source 可解析(预播种工件在位或解析自 vendored 安装闭包);既有 userData profile 投影存在;git 工作区除配置文件外干净"
  fixture_spec:
    entities:
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "valid config containing @dsh-forge/plugin-hello-world with resolvable source"
      - entity_type: "UserDataProfileProjection"
        min_count: 1
    state_requirements:
      - description: "M1 基线冷启动测量已归档,扩展后的 live-ui-probe 计时口径可用"
        prerequisite_entity: "PluginBundleConfig"
- Input: "用户启动 dsh-forge 壳(主进程拉起,启动期调和执行)"
- Output: "hello-world 物化进 userData profile 并完成装配;boot roster 含该产品插件条目;面板在壳内既有稳定槽位区域渲染;冷启动(主进程拉起到 Webview 首帧)相对 M1 基线增量不超过 5% 且绝对值不超过 100ms"
- State: "profile bundle manifest 按配置顺序含 hello-world;profile node_modules 完成物化(带 .dsh-forge-seed.json 种子标记);git diff 显示壳代码零改动"
- Side-effect: "userData profile 目录新增物化文件;live-ui-probe 采集 DOM/截图证据归档"
- Invariants: "装配唯一派生自产品级配置,壳内无新增硬编码清单"

## Outcome "cold-start-regression"
<!-- source: journey edge case 2b -->
- Preconditions: "配置化改动使冷启动(主进程拉起到 Webview 首帧)超出预算:相对 M1 基线增量大于 5% 或绝对值大于 100ms"
  fixture_spec:
    entities:
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "config whose materialization/assembly cost pushes cold start beyond the M1 baseline budget"
      - entity_type: "M1BaselineMeasurement"
        min_count: 1
- Input: "用户运行扩展后的 live-ui-probe 计时测量并与 M1 基线归档比对"
- Output: "超预算被判定为回归红灯(视为未通过);同步检查 M1 验收面(SC7 UI 对等、SC9 崩溃恢复)并报告保持绿"
- State: "回归证据归档;产品状态不被测量操作修改(测量只读)"
- Side-effect: "计时证据与比对结论写入归档通道"

## Outcome "seed-sha-drift-converge"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-018(host-profile/index.ts: 种子标记携带工件 sha256,重跑幂等,sha 漂移收敛)——预播种形态下 staged 工件更新后旧投影与新工件 sha 不一致是重复启动的现实边界 -->
- Preconditions: "userData profile 中 hello-world 已按旧 sha256 工件物化;app resources 中的 staged tarball 已更新为新 sha256(上游/插件工件漂移)"
  fixture_spec:
    entities:
      - entity_type: "UserDataProfileProjection"
        min_count: 1
        field_constraints:
          - field: "seed_marker_sha"
            value: "sha256 of an older staged tarball artifact"
      - entity_type: "StagedTarballArtifact"
        min_count: 1
        field_constraints:
          - field: "sha256"
            value: "differs from the profile seed marker sha256"
- Input: "用户再次启动壳(启动期调和重新执行)"
- Output: "种子标记 sha 漂移被识别并收敛——物化按新工件重建(写一次语义允许 sha 漂移收敛,非推倒整个 profile),面板最终渲染一致"
- State: "该条目的 profile 物化与种子标记更新为新 sha256;其余条目物化不受影响"
- Side-effect: "none"

## Journey Invariants

- 配置增删两次操作的壳代码 diff = 0(配置是插件树唯一事实源,壳代码常量清单不得回归)
- 产品清单条目对运行时启停只读(产品级配置不被第二写入方破坏)
- 对账/调和只做清理与失效,不发明旁路装配通道(dsh 插件机制为唯一装配机制)
- 配置化改动不引入壳启动回归(冷启动预算内),M1 验收面(SC7/SC9)保持绿
- 离线自足、进程足迹 = 2、无监听端口等 M1 NFR 在增删全程不被破坏
