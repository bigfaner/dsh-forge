---
journey: "dual-env-plugin-assembly"
step: 6
step-action: "验收打包/闭包分发形态与离线自足"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/journey.md
skip_eval: true
state-verification: partial
---

# Contract: dual-env-plugin-assembly / Step 6: 验收打包/闭包分发形态与离线自足

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "spike 落档的分发形态可用(tarball 内置 + 壳侧预播种:pnpm pack 工件 staged 进 app resources,配置以 tarball: 源引用);打包态/离线壳可启动;live-ui-probe 可探测打包产物(--executable)"
  fixture_spec:
    entities:
      - entity_type: "StagedTarballArtifact"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "PluginBundleConfig"
        field_constraints:
          - field: "source_form"
            value: "tarball:plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz"
      - entity_type: "PackagedShell"
        min_count: 1
    state_requirements:
      - description: "offline environment (no external network access) for assembly + boot"
        prerequisite_entity: "PackagedShell"
- Input: "以落档分发形态将 hello-world 装配进打包态/离线壳并启动"
- Output: "插件在该形态下完成装配并渲染;产物级校验扫描插件构建产物的模块来源绿灯(任何模块解析至 vendor/ 树即红灯——本次绿灯);离线自足 NFR 兼容性结论显式落档"
- State: "离线壳 userData profile 完成预播种物化(带种子标记);装配与启动全程无网络依赖"
- Side-effect: "打包腿证据(boot roster、面板 DOM/截图、离线模拟)归档"
- Invariants: "离线装配+启动全程无网络依赖(dsh-app:// 自定义协议链路不走外部网络)"

## Outcome "offline-nfr-conflict"
<!-- source: journey edge case 6b -->
- Preconditions: "spike 选定的分发形态在离线壳内需要网络(如装配期 npm 物化拉网)"
  fixture_spec:
    entities:
      - entity_type: "PackagedShell"
        min_count: 1
        field_constraints:
          - field: "network_access"
            value: "offline — external network unavailable"
      - entity_type: "DistributionForm"
        min_count: 1
        field_constraints:
          - field: "network_requirement"
            value: "assembly or boot requires external network"
- Input: "在离线环境以该形态装配并启动壳"
- Output: "该形态与离线自足 NFR 的冲突被显式落档并触发形态重选(tarball 内置 / 预播种兜底);不允许带冲突过关"
- State: "形态结论更新为兼容候选;不产生带冲突的验收通过记录"
- Side-effect: "冲突记录与形态重选结论落档"

## Outcome "staged-artifact-name-mismatch"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-027(stage-plugin-tarballs.mjs: staged 工件文件名必须等于配置声明基名,插件版本 bump 未同步配置即响亮失败;--check 校验 staged 文件在位)——打包腿的版本同步边界 -->
- Preconditions: "插件版本 bump 后 staged 工件基名与产品配置声明的 tarball: 基名不一致(或 staged 文件缺失)"
  fixture_spec:
    entities:
      - entity_type: "StagedTarballArtifact"
        min_count: 1
        field_constraints:
          - field: "basename"
            value: "differs from the config-declared tarball basename, or file missing"
      - entity_type: "PluginBundleConfig"
        min_count: 1
- Input: "运行 stage-plugin-tarballs(--check)或启动打包腿验收"
- Output: "响亮失败(退出码非 0 / 启动期诊断),指明配置声明与 staged 工件不符;不静默装错版本或缺装"
- State: "验收腿不通过;版本 bump 与配置/工件同步修复后可重跑"
- Side-effect: "none"

## Journey Invariants

- 壳内插件树装配唯一派生自产品级配置,全程不出现新的壳内硬编码清单(bundle 清单焊死缺陷不得回归)
- 插件构建产物的模块来源在任何步骤都零 vendored 树引用(产物级校验绿灯)
- 两侧环境(官方 dsh web 与 dsh-forge 壳)对同一插件的渲染与交互行为一致
- 插件只走标准客户端插件 API(rpc/fetch/stream,carrier 面以内),不引入新的壳内进程内代码路径
- 对齐线依赖始终 exact 等于 UpstreamLock.desktopHostVersion(当前 0.1.6-alpha.2),cordis 单列独立版本线
