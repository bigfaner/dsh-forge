---
id: "fix-1"
title: "Fix: M3 派发链两断——worker 全局 deny 名表错位拆 spawn + 预设行内 plugin-forge 行遮蔽全局配置实例"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: M3 派发链两断——worker 全局 deny 名表错位拆 spawn + 预设行内 plugin-forge 行遮蔽全局配置实例

## Root Cause

3.9 补验发现的两处产品缺陷（complex——跨 contracts/预设底稿/driver 装配面，3 轮实跑 + 4 枚诊断探针定位，3.9 硬规则禁就地改 contracts pin/design 裁决故转 fix）：

【缺陷①drift #10——派发恒断】WORKER_GLOBAL_DENY_TOOLS=['ask-user','delegation','todo','present'] 四名中三名在上游 0.2.0-rc.2 组合不存在（实名 ask_user_question / todo_write / delegation 族=subagent_fork+list_agents 等）。in-process driver 的 tools.restrict() 对未知名 loud 校验 → 任意 taskType spawn 恒 ERR_SPAWN_FAILED → 3 连败 halted。修复 = 名表按实面重映射（OQ#2/5.1 pin 面提前兑现：deriveWorkerToolFilter 与 WORKER_GLOBAL_DENY_TOOLS 同步改；注意 'present' 实名恰为 present 已正确）。

【缺陷②drift #9——预设会话路由断】3.7 双行形态：expedition/blitz 底稿行内 plugin-forge 增量行（config-less）在预设会话胜出工具注册面 → 全局行 bindingsFile 配置不可达 → 远征/突击会话全部 forge 动词 ERR_WORKSPACE_NOT_REGISTERED（标准模式对照组同径全绿；bindings 文件在盘行正确）。处置三选一（tech-design Appendix drift #9 列出）：行内行携带同 config / 去行内行 / 装载去重取配置实例——需裁决后落。

验收：spikes/m3-s5-s6-presets/m3-rerun.spec.ts W 用例（M3R_FORM=m3-dev，标准模式绕行径拆除后可回默认远征）全绿 = deny 零泄漏 + dispatchPrompt digest 对账 + AGENTS.md 到达 + run-tests 按需加载正反例。相关 drift 记账：docs/features/dsh-forge-m3-bootstrap-presets/design/tech-design.md Appendix #9/#10。

## Reference Files

- Source: packages/contracts/src/worker-matrix.ts,apps/host/src/profile/presets/expedition.patch.yml,apps/host/src/profile/presets/blitz.patch.yml
- Test script: spikes/m3-s5-s6-presets/m3-rerun.spec.ts
- Test results: W 用例三轮：①ERR_WORKSPACE_NOT_REGISTERED（远征默认会话，标准模式对照全绿）；②标准模式 dispatchTask → ERR_SPAWN_FAILED unknown global tools ask-user/delegation/todo ×3 → halted 粘住（driver tools.restrict loud 校验；实面实名=ask_user_question/todo_write/subagent_fork/list_agents 等 33 员清单在 evidence dispatch-round）。证据：Z:/project/dsh/tmp-redesign/m3-3-9/m3-dev/evidence.json + spikes/m3-s5-s6-presets/VERIFICATION-3.9.md W 节

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `packages/contracts/src/worker-matrix.ts,apps/host/src/profile/presets/expedition.patch.yml,apps/host/src/profile/presets/blitz.patch.yml` to extract the first file path (comma-separated).
2. Run `forge surfaces --json <file-path>` to resolve surface-key/type.
3. Use the resolved surface-type to load the appropriate `rules/surfaces/<type>.md` for test orchestration guidance.

If `forge surfaces --json` fails (no surfaces configured, command not found), proceed without surface information — this does not block the fix.

## Fix Boundaries

When fixing test failures, observe these boundaries:

**Forbidden:**
- Starting dev server (`npx expo start`, `npm run dev`, etc.)
- Running `npm install` more than 3 times — mark task as blocked if dependency installation fails 3 times
- Running full test suite — regression is verified by the dispatcher after fix completes
- Manually opening browser to verify rendering

**Correct workflow:**
1. Read failing test + corresponding component source
2. Compare test's expected testID/selectors vs actual DOM structure
3. Modify component (add testID) or test (adjust selectors/assertions)
4. Run targeted tests on affected packages — unit tests must pass
5. Record completion

## Verification

After fixing, verify the fix works:
1. Run targeted tests on changed packages: `go test -race ./affected/package/...`
2. Replace the path with the actual packages you modified

> **Note:** Full project-wide tests run at CLI submit (`forge task submit`) — agent runs targeted tests only.

Full regression is verified by the dispatcher, not by this fix task.

When this task is recorded as completed via `task record`, the source task 3.9 is automatically restored to pending if all its dependencies are completed.
