---
journey: "config-driven-plugin-lifecycle"
step: 1
step-action: "在产品级配置中新增 hello-world 条目"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/journey.md
skip_eval: true
state-verification: full
---

# Contract: config-driven-plugin-lifecycle / Step 1: 在产品级配置中新增 hello-world 条目

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "壳可启动且产品级配置 plugin-bundles.json 在位、可读、结构合法;当前 bundles 列表不含 hello-world 条目;存在一个既有 userData profile 投影(写一次语义基线)"
  fixture_spec:
    entities:
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "path"
            value: "apps/desktop/resources/plugin-bundles.json"
          - field: "state"
            value: "valid readable JSON, bundles array without @dsh-forge/plugin-hello-world"
      - entity_type: "UserDataProfileProjection"
        min_count: 1
- Input: "编辑产品级配置的 bundles 数组,新增 @dsh-forge/plugin-hello-world 条目(内置 bundle 形态,source 为 tarball: 指向预播种工件或省略)"
- Output: "配置文件更新成功且保持合法 JSON 结构;hello-world 条目出现在产品清单中,配置仍是插件树唯一事实源"
- State: "磁盘上产品级配置包含 hello-world 条目;壳尚未重启,userData 投影保持原状未受影响"
- Side-effect: "git 工作区仅出现该配置文件的修改;壳源代码零改动"
- Invariants: "产品清单条目对运行时启停只读;配置为插件树唯一事实源"

## Outcome "config-malformed"
<!-- Web surface-required outcome derivation: validation-error — 配置编辑面的非法输入腿(文件缺失/不可读/格式非法) -->
- Preconditions: "产品级配置文件不存在、不可读或格式非法(空文件、非 JSON、缺少非空 bundles 数组)"
  fixture_spec:
    entities:
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "missing or malformed (unparseable JSON or empty/non-array bundles)"
- Input: "用户启动壳(壳在启动期读取该配置)"
- Output: "显式启动期诊断失败或落入声明的安全默认(不静默装配未知插件树);错误信息指向配置文件问题,不出现无诊断的崩溃或半装配状态"
- State: "userData 投影不被未知插件树污染;无半装配残留;进程不悬挂"
- Side-effect: "none"

## Outcome "source-missing"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-016/FT-018/FT-027(stage-plugin-tarballs.mjs: staged 文件名必须等于配置声明基名,版本 bump 未同步配置即响亮失败)——配置条目合法但 source 引用的工件缺席是版本 bump 后的现实边界 -->
- Preconditions: "配置条目可被合法解析,但其 source 引用的 tarball 工件在 app resources 中不存在(如插件版本 bump 后未重新 stage)"
  fixture_spec:
    entities:
      - entity_type: "PluginBundleConfig"
        min_count: 1
        field_constraints:
          - field: "state"
            value: "valid JSON with an entry whose source references a missing staged tarball artifact"
- Input: "启动壳触发启动期调和"
- Output: "失败显式可见且可诊断(配置声明的工件基名与 staged 文件不符或缺缺失即响亮失败),不静默跳过该条目继续装配"
- State: "profile bundle manifest 不写入无法物化的条目;profile node_modules 无半物化目录残留"
- Side-effect: "none"

## Journey Invariants

- 配置增删两次操作的壳代码 diff = 0(配置是插件树唯一事实源,壳代码常量清单不得回归)
- 产品清单条目对运行时启停只读(产品级配置不被第二写入方破坏)
- 对账/调和只做清理与失效,不发明旁路装配通道(dsh 插件机制为唯一装配机制)
- 配置化改动不引入壳启动回归(冷启动预算内),M1 验收面(SC7/SC9)保持绿
- 离线自足、进程足迹 = 2、无监听端口等 M1 NFR 在增删全程不被破坏
