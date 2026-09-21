---
journey: "dual-env-plugin-assembly"
step: 2
step-action: "在官方 dsh web 界面观察消费向渲染"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/journey.md
skip_eval: true
state-verification: partial
---

# Contract: dual-env-plugin-assembly / Step 2: 在官方 dsh web 界面观察消费向渲染

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "Step 1 已完成(hello-world 已自装进官方 dsh web 的测试 profile);界面可打开;hello-world 声明的注入目标为既有稳定基座槽位(ui-chat / ui-renderer 核心槽之一:conversation.chat.assistant-actions 条带)"
  fixture_spec:
    entities:
      - entity_type: "SelfInstallableProfile"
        min_count: 1
        field_constraints:
          - field: "installed_plugins"
            value: "contains @dsh-forge/plugin-hello-world"
      - entity_type: "CoreSlot"
        min_count: 1
        field_constraints:
          - field: "slot_key"
            value: "conversation.chat.assistant-actions (ui-chat stable core strip)"
- Input: "打开装配后的官方 dsh web 界面,查看既有稳定基座槽位所在的界面区域"
- Output: "hello-world 面板渲染进目标稳定槽位所在的既有界面区域(消费向成立);界面其余部分不受影响;面板带可识别的 DOM 标记(data-dsh-forge-plugin)"
- State: "界面呈现含插件面板的完整会话视图;宿主核心界面功能不受影响"
- Side-effect: "live-ui-probe 类通道可采集 DOM/截图证据归档"
- Invariants: "面板注入不改变宿主核心界面的既有功能面"

## Outcome "target-slot-missing"
<!-- source: journey edge case 2b -->
- Preconditions: "插件声明的注入目标槽位键在目标环境不存在(或属上游不稳定面)"
  fixture_spec:
    entities:
      - entity_type: "PluginPackage"
        min_count: 1
        field_constraints:
          - field: "declared_inject_target"
            value: "slot key absent from the target environment"
      - entity_type: "SelfInstallableProfile"
        min_count: 1
- Input: "在目标环境装配该插件并打开界面"
- Output: "失败显式可见(装配期或启动期报错),而非面板静默不渲染;诊断信息指向槽位键声明问题"
- State: "无静默的半装配态;界面其余部分正常"
- Side-effect: "none"

## Outcome "loading-state"
<!-- source: inferred -->
<!-- reasoning: Web surface 常见边界 loading-state + Fact Table FT-028(live-ui-probe: 真实链路启动须等待 UI 就绪,主进程拉起到 Webview 首帧有时延)——装配期启动窗口是第三方首次打开界面的现实边界 -->
- Preconditions: "壳/官方环境已拉起但装配与 Webview 首帧尚未完成(启动窗口期),用户已打开界面"
  fixture_spec:
    entities:
      - entity_type: "SelfInstallableProfile"
        min_count: 1
        field_constraints:
          - field: "installed_plugins"
            value: "contains @dsh-forge/plugin-hello-world"
    state_requirements:
      - description: "application booted but webview first frame / assembly not yet complete"
        prerequisite_entity: "SelfInstallableProfile"
- Input: "用户在启动窗口期内观察界面"
- Output: "界面呈现可感知的加载/阻塞态而非空白假死;装配完成后插件面板随首帧或其后立即出现,无需用户手动刷新"
- State: "启动窗口期结束后界面收敛到完整装配态"
- Side-effect: "none"

## Journey Invariants

- 壳内插件树装配唯一派生自产品级配置,全程不出现新的壳内硬编码清单(bundle 清单焊死缺陷不得回归)
- 插件构建产物的模块来源在任何步骤都零 vendored 树引用(产物级校验绿灯)
- 两侧环境(官方 dsh web 与 dsh-forge 壳)对同一插件的渲染与交互行为一致
- 插件只走标准客户端插件 API(rpc/fetch/stream,carrier 面以内),不引入新的壳内进程内代码路径
- 对齐线依赖始终 exact 等于 UpstreamLock.desktopHostVersion(当前 0.1.6-alpha.2),cordis 单列独立版本线
