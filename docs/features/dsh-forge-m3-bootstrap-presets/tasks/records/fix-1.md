---
status: "completed"
started: "2026-10-08 00:54"
completed: "2026-10-08 01:42"
time_spent: "~48m"
---

# Task Record: fix-1 Fix: M3 派发链两断——worker 全局 deny 名表错位拆 spawn + 预设行内 plugin-forge 行遮蔽全局配置实例

## Summary
M3 派发链双断修复：①WORKER_GLOBAL_DENY_TOOLS 按上游 0.2.0-rc.2 实面重映射为实名八员（ask_user_question / delegation 族五员 subagent_fork·list_agents·send_message·interrupt_agent·workflow / todo_write / present——四族语义不变；spawn provider 惰性注册的 subagent 刻意不入表），driver tools.restrict() 未知名 loud 校验拆 spawn 的根因消除，deriveWorkerToolFilter 消费常量自动同步；②drift #9 处置裁决 = 行内行携带同 config：expedition/blitz 底稿行内 plugin-forge[+spec] 增量行增 bindingsFile 占位符（{{plugin-forge-bindings}}），renderBootOverlay 物化与全局行同值（PresetOverlayInput 增必填物化锚，child.ts 传锚），预设会话行内实例自足 cwd 路由，ERR_WORKSPACE_NOT_REGISTERED 断链消除。验收 = m3-rerun.spec.ts W 用例（M3R_FORM=m3-dev）全绿：标准模式绕行径已拆除、默认远征会话直派（label=远征模式）、deny 零泄漏（scoped 探针）、dispatchPrompt digest 对账 equal=true×2、AGENTS.md 到达（上下文注入通道）、run-tests 按需加载正反例；复跑期顺带修正 spike 断言通道三处测量缝（探针 scoped 面 / user-message 载荷位 / system-message 事件型）。drift #9/#10 处置段已回填 tech-design Appendix，VERIFICATION-3.9.md W 节收口回填。

## Changes

### Files Created
无

### Files Modified
- packages/contracts/src/worker-matrix.ts
- packages/contracts/src/worker-matrix.test.ts
- packages/plugin-forge/src/tools/dispatch-task.test.ts
- apps/host/src/profile/presets/expedition.patch.yml
- apps/host/src/profile/presets/blitz.patch.yml
- apps/host/src/boot/overlay.ts
- apps/host/src/boot/overlay.test.ts
- apps/host/src/boot/child.ts
- apps/host/src/profile/presets.test.ts
- spikes/m3-s5-s6-presets/m3-rerun.spec.ts
- spikes/m3-s5-s6-presets/overlay-m3.mjs
- spikes/m3-s5-s6-presets/probe-env/index.js
- spikes/m3-s5-s6-presets/VERIFICATION-3.9.md
- docs/features/dsh-forge-m3-bootstrap-presets/design/tech-design.md

### Key Decisions
- drift #9 三选一裁决 = 行内行携带同 config（Interface 5 预设自含形态保留：去行内行偏离设计且 plugin-forge-spec 无全局行将整体失踪；装载去重 = 上游 loader 行为非产品缝）——bindingsFile 经占位符物化与全局行同值单源
- deny 名表 spawn-provider subagent 刻意不入：该工具惰性注册（provider 缺席环境不在场），入表会在该类环境复现 unknown-name 拆 spawn；已注册环境下 worker 可见 subagent 的残余缝 = 已知限制，随 5.1 工具名映射 pin 全表收口裁决（tech-design drift #10 处置段记档）
- W 复跑发现的三处 spike 测量缝就地修正（非产品缺陷）：探针须用 ToolRuntime.schemas(exec.agent) scoped 面（裸 ctx.tools.schemas() 无 scope 量的是全局注册表）；user/message 事件载荷在 data 直位非 data.message；系统提示词事件类型 = system/message；AGENTS.md 基线与技能目录的实际承载通道 = user/message 上下文注入事件（source.kind=agent-instructions/skill-catalog）
- overlay-m3.mjs 负对照生成器剔 bindingsFile 占位块回 config-less 旧形（负对照变量隔离 = 仅 skill 目录行表达式）

## Test Results
- **Tests Executed**: Yes
- **Passed**: 568
- **Failed**: 0
- **Coverage**: 97.4%

## Acceptance Criteria
- [x] W 用例全绿（M3R_FORM=m3-dev，标准模式绕行径拆除后回默认远征会话直派）
- [x] deny 零泄漏（worker 面无任何全局拒绝集/forge 闭包工具名）
- [x] dispatchPrompt digest 对账（worker 首条用户消息 digest === claim 行 digest）
- [x] AGENTS.md 基线到达 worker 上下文
- [x] run-tests 按需加载正反例（test 任务调用 / doc 任务不调用）
- [x] drift #9/#10 记账回填（tech-design Appendix 处置段 + VERIFICATION-3.9.md W 节）

## Notes
测试口径：scoped vitest contracts+plugin-forge 283/283 + apps/host 285/285（含新增断言）= 568 全绿，0 失败；just compile（pnpm build 全拓扑）/fmt（no-op）/lint（ox+imports+tokens+selftest+types+test-types）全绿。coverage 97.41 = contracts+plugin-forge+path-key scoped v8 lines（覆盖表聚合）；host 变更缝 overlay.ts 100% lines（host 全包 58.52 = 既有基线形态——window/main Electron 胶水不在单测面，沿 3.8 记录口径）。W 用例验收轮证据：evidence.json 步 dispatcher-default-preset（label=远征模式，绕行径拆除正面判定场）/dispatch-round（task-spawned toolFilter=12 实名表）/worker-analysis（denyLeak=[]×2、agentsMarkerInContext=true×2、runTests 正反例）/digest-reconciliation（equal=true×2）。运行期观察：worker 终态两态均见（completed/blocked——blocked = 夹具无测试面的如实受阻，非断言门）；task-worker-done 终态等待缝已补（dump=起跑信号，closeApp 前不等终态会杀活 worker）。
