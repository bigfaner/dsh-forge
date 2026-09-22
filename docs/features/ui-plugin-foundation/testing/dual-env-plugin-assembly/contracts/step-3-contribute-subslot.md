---
journey: "dual-env-plugin-assembly"
step: 3
step-action: "观察贡献向的自有子槽位开放"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/journey.md
skip_eval: true
state-verification: partial
---

# Contract: dual-env-plugin-assembly / Step 3: 观察贡献向的自有子槽位开放

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "hello-world 已装配且面板渲染成立(Step 2 通过);同一界面区域内 hello-world 经 ui-slots 的 register 原生支持登记了自有子槽位(组件 + 子槽位 + store 席位);尚无第三方在该子槽位注册"
  fixture_spec:
    entities:
      - entity_type: "ContributedSubSlot"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "PluginPackage"
        field_constraints:
          - field: "slot_key"
            value: "hello-world.panel"
          - field: "kind"
            value: "single, scope session"
      - entity_type: "PluginPackage"
        min_count: 1
        field_constraints:
          - field: "name"
            value: "@dsh-forge/plugin-hello-world"
- Input: "在同一界面区域查看 hello-world 登记的自有子槽位"
- Output: "插件贡献的自有子槽位渲染默认内容(面板默认态),子槽位在界面上真实存在且可寻址"
- State: "子槽位进入 ui-slots 注册表;默认内容随面板渲染"
- Side-effect: "none"

## Outcome "third-party-registration-renders"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-022/FT-023(hello-world src/client: hello-world.panel 子槽位面向第三方注册;撞键复制品 fixture 正是经该子槽位声明声明的第三方)——「子槽位对第三方真实开放」需要一条独立于默认内容渲染的实证腿 -->
- Preconditions: "hello-world 已装配且子槽位默认内容渲染成立;存在第三个插件包(如撞键复制品 fixture)声明向 hello-world.panel 子槽位注册组件"
  fixture_spec:
    entities:
      - entity_type: "ContributedSubSlot"
        min_count: 1
        field_constraints:
          - field: "slot_key"
            value: "hello-world.panel"
      - entity_type: "ThirdPartyRegistrant"
        min_count: 1
        field_constraints:
          - field: "declared_target"
            value: "registers a component into hello-world.panel"
- Input: "装配第三方注册方并查看该子槽位区域"
- Output: "第三方组件经子槽位注册后渲染进该区域(贡献向 = 平台可被第三方扩展成立),注册机制走标准 ui-slots 通道"
- State: "子槽位注册表含第三方声明;渲染反映注册结果"
- Side-effect: "none"

## Outcome "vendored-reference-redlight"
<!-- source: journey edge case 3b -->
- Preconditions: "插件构建产物中存在模块解析至本仓 vendor/ 树(路径含 vendor/ 前缀或 file: 协议指向仓内)"
  fixture_spec:
    entities:
      - entity_type: "PluginBuildArtifact"
        min_count: 1
        field_constraints:
          - field: "module_resolution"
            value: "at least one module resolves into the repo vendor/ tree"
- Input: "运行产物级模块来源校验(该校验并入断言门禁 pnpm verify:plugins)"
- Output: "校验红灯——零 vendored 文件引用的交付件约束被机器守住;插件不被接受进入双环境验收"
- State: "门禁失败状态显式;不产生验收通过记录"
- Side-effect: "none"

## Journey Invariants

- 壳内插件树装配唯一派生自产品级配置,全程不出现新的壳内硬编码清单(bundle 清单焊死缺陷不得回归)
- 插件构建产物的模块来源在任何步骤都零 vendored 树引用(产物级校验绿灯)
- 两侧环境(官方 dsh web 与 dsh-forge 壳)对同一插件的渲染与交互行为一致
- 插件只走标准客户端插件 API(rpc/fetch/stream,carrier 面以内),不引入新的壳内进程内代码路径
- 对齐线依赖始终 exact 等于 UpstreamLock.desktopHostVersion(当前 0.1.6-alpha.2),cordis 单列独立版本线
