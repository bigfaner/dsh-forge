---
journey: "dual-env-plugin-assembly"
step: 1
step-action: "以第三方视角在官方 dsh web 自装 hello-world 插件"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/journey.md
skip_eval: true
state-verification: full
---

# Contract: dual-env-plugin-assembly / Step 1: 以第三方视角在官方 dsh web 自装 hello-world 插件

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "官方 dsh web 运行环境可用;存在可自装的测试 profile(第三方用户视角,装/卸自由);hello-world 插件包可安装(pnpm pack 产物或 npm 源),依赖声明全部 exact(vendored 锁基准 desktopHostVersion = 0.1.6-alpha.2)"
  fixture_spec:
    entities:
      - entity_type: "OfficialDshWebEnvironment"
        min_count: 1
      - entity_type: "SelfInstallableProfile"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "OfficialDshWebEnvironment"
      - entity_type: "PluginPackage"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "@dsh-forge/plugin-hello-world"
          - field: "alignment_deps"
            value: "every @deepseek-ai/dsh-client-* dependency exact 0.1.6-alpha.2, cordis exact 4.0.2"
- Input: "对自己的 profile 执行 dsh plugin add 装入 hello-world 插件包"
- Output: "插件被记入 profile bundle 清单;profile node_modules 完成物化;依赖解析锁定为 exact 0.1.6-alpha.2(不落 dist-tag 旧版);全程零 vendored 树文件引用"
- State: "profile bundle 清单新增 hello-world 条目;profile node_modules 含插件物化及其依赖闭包"
- Side-effect: "安装动作写入用户自己的官方 dsh web profile(可移除恢复)"
- Invariants: "对齐线依赖始终 exact 等于 UpstreamLock.desktopHostVersion;cordis 单列独立版本线"

## Outcome "dist-tag-stale-contract"
<!-- source: journey edge case 1b -->
- Preconditions: "插件依赖以裸包名或 ^ 范围声明,或借 alpha tag 定位但未解析锁定为 exact——npm latest dist-tag 停在旧版 0.0.1-rc.1"
  fixture_spec:
    entities:
      - entity_type: "PluginPackage"
        min_count: 1
        field_constraints:
          - field: "dependency_spec"
            value: "bare name or ^ range or unresolved alpha dist-tag on an alignment-line dependency"
      - entity_type: "SelfInstallableProfile"
        min_count: 1
- Input: "执行 dsh plugin add 装入该依赖形态的插件包"
- Output: "装配不静默拿到旧契约:版本一致性断言红灯拦截(对齐线依赖必须等于 desktopHostVersion);失败可见、可诊断,指明失配条目;用户改为 exact 版本后可重试"
- State: "profile 不进入旧契约装配态;失配证据可归档"
- Side-effect: "none"

## Outcome "network-error"
<!-- source: inferred -->
<!-- reasoning: Web surface 常见边界 network-error + Fact Table FT-024/FT-027(装配物化经 npm/pnpm pack 通道)——registry 不可达是第三方自装的现实边界 -->
- Preconditions: "本机无法访问 npm registry(@deepseek-ai/dsh-client-* 族与 cordis 已发布,但网络不可用或 registry 故障)"
  fixture_spec:
    entities:
      - entity_type: "SelfInstallableProfile"
        min_count: 1
      - entity_type: "NetworkAccess"
        min_count: 1
        field_constraints:
          - field: "registry_reachable"
            value: false
- Input: "执行 dsh plugin add(安装期需要拉取依赖)"
- Output: "失败显式可见(网络错误信息指向 registry 不可达),不静默挂起或留下半物化;用户可在网络恢复后重试"
- State: "profile bundle 清单不写入未完成装配的条目;无半物化 node_modules 残留(或残留可被重试收敛)"
- Side-effect: "none"

## Journey Invariants

- 壳内插件树装配唯一派生自产品级配置,全程不出现新的壳内硬编码清单(bundle 清单焊死缺陷不得回归)
- 插件构建产物的模块来源在任何步骤都零 vendored 树引用(产物级校验绿灯)
- 两侧环境(官方 dsh web 与 dsh-forge 壳)对同一插件的渲染与交互行为一致
- 插件只走标准客户端插件 API(rpc/fetch/stream,carrier 面以内),不引入新的壳内进程内代码路径
- 对齐线依赖始终 exact 等于 UpstreamLock.desktopHostVersion(当前 0.1.6-alpha.2),cordis 单列独立版本线
