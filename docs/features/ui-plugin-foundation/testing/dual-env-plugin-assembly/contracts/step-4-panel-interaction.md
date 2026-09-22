---
journey: "dual-env-plugin-assembly"
step: 4
step-action: "点击面板触发运行链路"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/journey.md
skip_eval: true
state-verification: partial
---

# Contract: dual-env-plugin-assembly / Step 4: 点击面板触发运行链路

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "hello-world 面板已渲染(Step 2/3 通过);client 半身 store 席位(store seat)经同一 register 调用登记在位;面板上有可点击的交互入口"
  fixture_spec:
    entities:
      - entity_type: "StoreSeat"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "ContributedSubSlot"
        field_constraints:
          - field: "initial_state"
            value: "hello-world store seat created with initial state"
      - entity_type: "PluginPanel"
        min_count: 1
        field_constraints:
          - field: "interaction_entry"
            value: "clickable interactive entry present"
- Input: "点击 hello-world 面板上的交互入口"
- Output: "client 半身 store 席位状态更新并刷新渲染——运行链路实证(交互可观察),非静态注入"
- State: "store 席位状态发生可观察变化;面板渲染反映新状态"
- Side-effect: "none"
- Invariants: "点击 → store 更新 → 重渲染三者成链,证据可区分静态注入"

## Outcome "static-injection-illusion"
<!-- source: journey edge case 4b -->
- Preconditions: "面板渲染成功但 client 半身 store 席位状态更新未生效(静态注入而非运行链路)"
  fixture_spec:
    entities:
      - entity_type: "PluginPanel"
        min_count: 1
        field_constraints:
          - field: "render_source"
            value: "statically injected markup, store seat not wired"
      - entity_type: "StoreSeat"
        min_count: 1
        field_constraints:
          - field: "wiring"
            value: "state updates do not reach the rendered panel"
- Input: "点击面板交互入口并观察渲染"
- Output: "交互检查失败被识别为未通过(渲染必须随 store 席位状态更新刷新);live-ui-probe 采集的证据能区分静态注入与运行链路(点击后 DOM 文本/截图无变化即暴露)"
- State: "该装配被判未通过;不产生验收通过证据"
- Side-effect: "none"

## Outcome "interaction-error-visible"
<!-- source: inferred -->
<!-- reasoning: Fact Table FT-028(live-ui-probe 采集 console/pageerror/网络失败证据)——点击处理抛错是运行链路的现实边界,错误须可被证据通道捕获而非吞没 -->
- Preconditions: "面板交互入口的点击处理在运行时抛出异常(如插件代码缺陷)"
  fixture_spec:
    entities:
      - entity_type: "PluginPanel"
        min_count: 1
        field_constraints:
          - field: "click_handler"
            value: "throws at runtime when invoked"
- Input: "点击面板交互入口并观察界面与证据通道"
- Output: "错误显式可见(pageerror/console 被 live-ui-probe 类通道采集为证据);面板或界面不进入无响应假死;错误可归因到插件点击处理"
- State: "异常不破坏宿主核心界面;后续交互仍可进行"
- Side-effect: "错误证据进入归档通道"

## Journey Invariants

- 壳内插件树装配唯一派生自产品级配置,全程不出现新的壳内硬编码清单(bundle 清单焊死缺陷不得回归)
- 插件构建产物的模块来源在任何步骤都零 vendored 树引用(产物级校验绿灯)
- 两侧环境(官方 dsh web 与 dsh-forge 壳)对同一插件的渲染与交互行为一致
- 插件只走标准客户端插件 API(rpc/fetch/stream,carrier 面以内),不引入新的壳内进程内代码路径
- 对齐线依赖始终 exact 等于 UpstreamLock.desktopHostVersion(当前 0.1.6-alpha.2),cordis 单列独立版本线
