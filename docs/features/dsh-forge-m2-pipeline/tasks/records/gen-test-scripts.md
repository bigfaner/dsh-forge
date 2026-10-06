---
status: "completed"
started: "2026-10-07 04:15"
completed: "2026-10-07 04:35"
time_spent: "~20m"
---

# Task Record: T-test-gen-scripts Generate Web E2E Test Scripts

## Summary
为 dsh-forge-m2-pipeline 七旅程生成 Web E2E 测试脚本（gen-test-scripts 技能主径）：每旅程一 spec + 一冒烟 + 按 Outcome 分组的边界测试，全部消费 e2e/support 支撑层（launch/rpc/navigation/anchors/session-files/modals/cleanup + replay 主径 executor/db-insert——fix-37 纪律：新 spec 零私有载体拷贝）。写动词经 DSH_FORGE_TEST_BRIDGE 测试钩子（五写动词），读面经 refetchOnce 单发（即时判据 Hard Rule），受控初态经 core 单源 seed 族直插。

## Changes

### Files Created
- e2e/specs/m2/task-dispatch-pipeline.spec.ts
- e2e/specs/m2/interrupted-dispatch-recovery.spec.ts
- e2e/specs/m2/fix-chain-auto-recovery.spec.ts
- e2e/specs/m2/task-overview-review.spec.ts
- e2e/specs/m2/task-session-linkage.spec.ts
- e2e/specs/m2/document-browsing.spec.ts
- e2e/specs/m2/workspace-registration-derived-path.spec.ts

### Files Modified
无

### Key Decisions
无

## Cases Generated
55

## Cases Evaluated
55

## Scripts Created
- e2e/specs/m2/task-dispatch-pipeline.spec.ts
- e2e/specs/m2/interrupted-dispatch-recovery.spec.ts
- e2e/specs/m2/fix-chain-auto-recovery.spec.ts
- e2e/specs/m2/task-overview-review.spec.ts
- e2e/specs/m2/task-session-linkage.spec.ts
- e2e/specs/m2/document-browsing.spec.ts
- e2e/specs/m2/workspace-registration-derived-path.spec.ts

## Test Results
生成门全绿（gen 阶段不跑 e2e 本体——run 归后续任务）：① tsc -p e2e/tsconfig.json 零错误（e2e 类型门基线）；② oxlint 七文件零告警；③ playwright --list 138 tests / 33 files 全量装载（新 55 例全数在册——转译与 import 解析实证）；④ // VERIFY: 标记零残留；⑤ 测试名零重复。断言深度七旅程全过阈（behavioral 93–95% ≥80%；deep 37–52% ≥30%）。

## Acceptance Criteria
- [x] 全部 7 旅程（web 面）各有测试脚本且含 ≥1 冒烟（happy path only）
- [x] 每 Contract Outcome 有断言承载（映射表见各文件头）
- [x] fixture_spec 实体足额落地（Project/Feature/Task/TaskEdge/TaskSessionLink/TaskRecord 经注册 + 动词 + seed 直插三通道）
- [x] 断言深度 ≥80% behavioral 且 ≥30% deep（逐旅程计数在文件头）
- [x] 编译门通过（tsc e2e 基线 + oxlint + playwright 装载）

## Notes
口径与裁决：① 输出目录——config 单面（surfaces: web）按技能应落 tests/<journey>/，但本仓两层测试模型（justfile：unit-test=vitest 任务提交门 / test=Playwright e2e）web 面唯一执行树 = e2e/specs（playwright testDir）；tests/ 下 vitest 项目不收录 Playwright spec（死代码 + 双门皆漏），故沿 T-test-gen-scripts 前例（p1mvp）与 M2 SC 面落 e2e/specs/m2/<journey>.spec.ts（无 staging、真实测试树）。② eval 门：七旅程 contracts 全部 ≥856（target 850）——非 SKIP_EVAL_GATE 形态。③ 三 Outcome（picker-failure-error-shown / derive-in-flight-loading / derive-rpc-error-state）在 e2e 面无故障注入通道，诚实映射到已在场组件单测（derived-store-row.test.tsx 相位机 + RegisterForm.test.tsx nativePickError 面），文件头留痕注记——非伪造断言。④ 会话侧（task-session-linkage）：零凭据会话夹具（fix-42 台账径），派发/执行双源 = 真实会话 × 合成执行会话（session_id 无存在性校验，数据面等价）。⑤ 冒烟「git 提交产生」的可观测面 = submit 审计行携带 commitHash（git 提交本体 = executor 侧动作，测试钩子不触 git——文件头注记）。⑥ 遗留待跑：e2e 本体执行归 T-test-run（run-tests 阶段）。
