---
status: "completed"
started: "2026-09-21 00:19"
completed: "2026-09-21 00:19"
time_spent: ""
---

# Task Record: fix-2 Project package runtime data (presets/assets/patch-yml) into the vendor closure

## Summary
「新会话」无响应根因: vendor 闭包只投影 src/**, agent-presets 出厂预设缺失, sessions.create 以 agent-preset/not-found 拒绝(上游 UI 仅 console.warn)。类修复: sync-upstream 投影规则纳入 presets/assets/scripts/根级 *.patch.yml+LICENSE, lock +32; .gitignore 移除 ad-hoc 排除; 重投影+重装+web dist 重建。新增真实例探针与全量 sweep(14/14 PASS 含真实模型回合 4.5s)。

## Changes

### Files Created
- scripts/acceptance/live-ui-probe.mjs
- scripts/acceptance/live-ui-sweep.mjs
- packages/desktop-host-vendor/vendored/packages/preset/agent-presets/presets/standard/agent.cordis.yml

### Files Modified
- scripts/sync-upstream.mjs
- vendor/upstream.lock.json
- .gitignore

### Key Decisions
- 修复走 lock 通道(完整性跟踪/提交)而非 install-host-closure 再加一层拷贝
- sweep 断言锚定上游事实: 空态专属控件/新会话 composer 专属按钮按状态断言
- e2e fixture 栈无法覆盖此类真链路缺陷, live probe/sweep 作为真链路验收层补充

## Test Results
- **Tests Executed**: Yes
- **Passed**: 14
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
无

## Notes
无
