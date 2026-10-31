---
journey: "default-agent-options-panel"
step: 1
action: "open-default-agent-options-tab"
title: "设置页打开「默认 Agent 选项」tab"
risk_level: "Medium"
surface: { type: "web", key: "expert-squad" }
anchors:
  panel: "#dswf-cfg-provider / #dswf-cfg-model / [data-cfg-state]"
  tab: "role=tab name=默认 Agent 选项（多贡献态）；单贡献 = 面板直呈"
anchors_source: "src-client/settings/index.tsx（registerDefaultOptionsTab / DefaultAgentOptionsTab）+ dsh-client-ui-settings-plugins PluginsSettingsSection.d.ts（官方核销）"
last_anchor_sync: "2026-10-31T12:00:00+08:00"
sources:
  - "testing/default-agent-options-panel/journey.md 步骤1 + 边界3b"
---

# Contract · step-1-open-default-agent-options-tab

## Outcome: success（tab 打开、面板 ready）

### Preconditions
- fixture_spec：dev 宿主启动（settings 域在场，configForms 服务可取）；工作区已注册（面板读口 workspace 参数锚）。

### Input
官方设置入口 `[aria-label="设置"]` → section「插件」→ tab「默认 Agent 选项」。

### Output
面板挂载：`data-cfg-state="ready"`；Provider/Model 文本输入占位「继承父Agent」；Reasoning 四选（默认/低/中/高）当前值「默认」（`data-select-value=""`）。

### State
configForms 快照 ready（writable 面按宿主形态如实）；插件 Config `defaultAgentOptions` 未配置 = 全空草稿。

### Side-effect
none（只读打开）。

### Invariants
- 单面板：无 tab 导航、无悬空警示块（proposal UI 面）；D5 微文案逐字。
- 注册缝 = settings.plugins.tab render slot；configForms 缺席 = 不注册本 tab（降级不悬空）。

## Outcome: settings-domain-absent（降级不注册）`source: inferred`

### Preconditions
- fixture_spec：宿主未组 settings 域（configForms 缺席）。

### Input
客户端装配期注册调用。

### Output
tab 不出现；console.warn「ctx.configForms/slots absent; settings tab not mounted」留痕；面板零 DOM 残留。

### State
插件其余面（面板/工具/服务）不受影响。

### Side-effect
none

### Invariants
- UI 不悬空：写径不存在的 tab 不挂载（注册门 = whileServed 在场门 / 直注册两态）。

## Journey Invariants
- 断言锚 = 稳定 data 属性/稳定 id（dswf-cfg-*），不断视觉坐标。
- 官方 section 只拥有导航与 tab chrome；页面内容 = feature-owned tab。
