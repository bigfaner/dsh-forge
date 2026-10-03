---
id: "fix-11"
title: "Fix: p1-mvp e2e 失败三簇——轨迹台账未接线 / 知识段注入口径 / Step1c hero CTA 偶发隐藏"
priority: "P0"
estimated_time: "2h"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: p1-mvp e2e 失败三簇——轨迹台账未接线 / 知识段注入口径 / Step1c hero CTA 偶发隐藏

> 合并记账说明：T-test-run（2026-10-03）全量 46 例跑出 6 失败 / 3 根因。forge task add 对同一
> source task 去重（一源一活跃 fix），故三簇并入本 fix 任务分节承载；建议按节顺序执行
> （①②确定性缺陷/口径，③排障）。跑测环境红线：**绝不改动 TMP/TEMP**（fixture 经 os.tmpdir()
> 落位，UI 导航硬编码 home→AppData→Local→Temp——重定向或 unset 都会整片错位超时，见
> agent-memory/dsh-forge-p1mvp-e2e-tmp-env.md）。

## 簇①（确定性，2 例）：轨迹 tab 永远空态——装配未接 transcript（生产代码缺口）

### 现象

- `e2e/specs/p1mvp/session-workbench.spec.ts` 冒烟（L378）：`[data-dswf-traj-row="tool"]` 60s 不可见——但**会话账本文件断言已通过**（jsonl 解码含 tool/call 事件）。
- `e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts` 冒烟（L492-494）：`expect.poll(tool 行数)≥2` 同因失败。

### 根因（已实证）

`apps/web/src/workbench/WorkbenchPanel.tsx` 装配 `<SessionPanel>` 时**未传 `transcript` prop**（缺省 `[]`）→ TrajectoryLedger 恒渲染「暂无轨迹」空态。ChatSnapshot→TranscriptEntry 映射是**登记在案的残留**（`apps/web/src/workbench/README.md` 残留节 + `ChatSurface.tsx` 头注 2.13/2.14），从未接线（`git log -S transcript` 证实装配史无此串）。投影/渲染面已就绪且有单测 pin（`views/session/transcript.ts` + `TrajectoryLedger.tsx`）。

### 修法

装配层接线官方 ChatSnapshot → `TranscriptEntry[]` 并传入 SessionPanel（wire 判别值→语义类映射表归装配层锚定，随实跑入 G1 pin 池——README 残留节既定路径）。改动面：`WorkbenchPanel.tsx`（+可能的 ChatSurface 窄面）；禁止改 e2e 断言。

## 簇②（确定性，3 例）：知识段注入口径——spec 断了 contract 自认 UNKNOWN 的另一侧

### 现象

- flywheel Step2b（L646）/ Step2c（L693）：无知识目录 / 空知识目录工作区的**真实 dogfood 系统提示词含** `## Project knowledge base` → `not.toContain` 硬断言失败。
- flywheel Step4d（L839，soft）：零命中检索后召回 tab 占位「本会话暂无召回」不可见（哨兵行口径）。

### 根因（已实证）

shipped = `packages/knowledge/src/index.ts` L40 插件加载即**无条件**注册 systemPrompt.section（段文本自身口径为 "may be registered"）。而 spec 行内注记明言「知识段注入口径 UNKNOWN……分歧交设计期裁决」——测试把待裁决口径硬断成了「无知识可召回即不注入」一侧。

### 修法

先裁决后动码：A) 产品侧按解析出的知识目录存在性门控段注册（改 `packages/knowledge`）；或 B) 维持无条件注入、修订 contract/spec 口径（把 Step2b/2c 改为 toContain 或按裁决重写；Step4d 随哨兵行口径一并裁决）。两侧不可混改（避免只翻断言过关）。dogfood 需真实凭据跑（~/.dsh/.credentials.yaml 在场）。

## 簇③（偶发，1 例）：sw Step1c hero CTA 偶发 hidden ≥10s（根因未钉，排障型）

### 现象

`session-workbench.spec.ts` Step1c（L467）：`[data-dswf-cta="add-project"]` resolved 但 `hidden` 持续 10s+；相位断言 `data-dswf-phase=hero` 已通过。**2 败 / 3 过**（run-05 全量败、run-06 单跑败、run-07 单跑过 + 诊断复刻件过）。

### 已排除（探针实证，脚本已焚）

- 干净 boot：CTA 盒 102×36 全链可见（probe1）。
- 官方 API-key 模态在场（不收起）：CTA 仍可见（probe3）——模态不藏背景。
- 收起模态后 t+4ms 即可见（probe2）；同径复刻 spec（playwright runner 内）通过。
- 排除：CSS（workbench.css .dswf-hero 纯 flex）、occlusion（pw 可见性与遮挡无关）、双实例/双 workbench（strict 单命中）。

### 剩余假设（按优先级）

1. 某些 boot 窗口初尺寸/布局竞态致中区零宽 → 盒 0×0=hidden（查 main.ts/官方壳窗口创建 + 失败窗的 getBoundingClientRect 证据）。
2. phase 瞬态 hero↔settling 振荡 + React 交换子树的渲染窗口。
3. kit 收敛期某官方容器暂态 display:none（>10s）。

### 取证建议

复刻 spec 但把 toBeVisible 换成 10s 轮询：每 2s 记 boundingBox + 祖先 display/visibility 链 + window.innerWidth/innerHeight；失败瞬间 page.screenshot。失败样本 trace 在 `e2e/test-results/p1mvp-session-workbench--w-21ca9-*`（retain-on-failure）。

## 全量跑测账（T-test-run 2026-10-03，46 例）

| journey | pass | fail | skip(留痕) |
|---|---|---|---|
| project-registration | 10 | 0 | 0 |
| project-registration-compensation | 5 | 0 | 3 |
| session-workbench | 4 | 2（冒烟=簇①、Step1c=簇③） | 1 |
| knowledge-browsing | 7 | 0 | 0 |
| knowledge-recall-flywheel | 2 | 4（冒烟=簇①、Step2b/2c=簇②、Step4d=簇②soft） | 3 |
| installer-smoke | 4 | 0 | 1 |

日志：`/z/tmp/p1mvp-run-03..10-*.log`（03=registration 绿、05=sw、09=flywheel、10=installer）。

## Reference Files

- Source: apps/web/src/workbench/WorkbenchPanel.tsx,apps/web/src/workbench/ChatSurface.tsx,apps/web/src/views/session/SessionPanel.tsx,packages/knowledge/src/index.ts,e2e/specs/p1mvp/session-workbench.spec.ts,e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts
- Test script: e2e/specs/p1mvp/session-workbench.spec.ts;e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts
- Test results: 簇① sw L378 / flywheel L492-494（tool 行 0 而 ledger 文件有事件）；簇② flywheel L646/L693（prompt 含知识段）/L839（召回占位 soft）；簇③ sw L467（CTA hidden 2/5 样本）

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `apps/web/src/workbench/WorkbenchPanel.tsx,apps/web/src/workbench/ChatSurface.tsx,apps/web/src/views/session/SessionPanel.tsx,e2e/specs/p1mvp/session-workbench.spec.ts,e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts` to extract the first file path (comma-separated).
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

When this task is recorded as completed via `task record`, the source task T-test-run is automatically restored to pending if all its dependencies are completed.
