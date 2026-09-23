---
status: "completed"
started: "2026-09-23 09:30"
completed: "2026-09-23 11:18"
time_spent: "~1h 48m"
---

# Task Record: T-eval-contract Evaluate Contract Quality

## Summary
Adversarial contract eval (forge:eval --type contract, [qa] scorer, scale 1100 / target 935 / max 3 iterations) run for all 6 dsh-forge-m2 journey contract families. All 6 PASS: task-session-execution-loop 1037 (iter 1), task-board-browsing 1046 (963→1046), dual-form-consistency 1074 (886→1074), multi-project-management 1084 (942→1084), feature-board-docs-browsing 1076 (885→1076), plugin-management 1067 (889→1067). 5 families required one revision round; 25 of 32 contract files revised. Recurring iteration-1 failure mode: Fixture Specification entity-completeness veto (asserted entities absent from fixture_spec.entities — SessionLink/Task/Feature chains), all resolved via family-convention entity declarations. Plugin-management additionally carried a hard factual defect (fixture cardinality 'forge 核心插件恰一个' vs shipped plugin-bundles.json 3 mandatory bundles) fixed against the real manifest. Final eval reports written to testing/<journey>/contracts/eval/report.md for all 6 families.

## Eval Score
- **Score**: 967/1000

## Findings
- multi-project: 「注册即激活」主张未归类且与现行代码相抵 (WorkbenchShell.tsx:378 register verb 不激活; PRD:61 意图源) — 需 inferred(PRD UF1) 注或新事实锚并与 step-5 口径同步; FT-037(3) 三冲突源只测其一且锚注释收窄事实原文
- feature-docs: 完成徽标/计数全满 dichotomy 无锚且与 Pill-on-every-card 设计相抵 (false-failing test 风险, gen-test-scripts 消费前需对齐); step-5 恢复目标树未约束 (无 docKinds/feature-slug 结构/FT-038 探测保证); step-3 只读渲染/外链禁用 guard 腿无 oracle 通道
- plugin-management: toggle 拒绝错误路径 (拒绝不乐观翻转 + 按码 toast + 守卫码重列, 实装存在) 零 Outcome 覆盖; UF6 中英双语影响说明文案未断言语言; mandatory-only 空态 (shipped 默认形态) 零覆盖; load-error-retry State 「失败重列保底」半断言本腿不可达
- session-loop (iteration-1 pass residuals): stale active-link liveness 不可测 (spike-1 无终端会话信号); restart harness-safety 不对称 (win32 ERR_SINGLE_INSTANCE flake); FT-045 source 判定序与 tech-design 相倒; SessionLink parent_entity 与 schema FK (Project 为 FK 父) 分歧
- board-browsing: 键盘操作 invariant 无 exercising 腿; loading 态窗口未工程化 (可能不可观测短); step-4 tree/group 视图缺 negative badge 断言
- dual-form: stub-CLI 对拍同源弱化 (与 workbench 读取近同源 — 需声明或排除真实 forge CLI 对拍腿); board-open-change 保留断言在 Task min_count 1 时空洞

## Severity
- **Severity**: minor

## Passed
- **Passed**: Yes

## Acceptance Criteria
- [x] Eval report generated for all Contracts (testing/<journey>/contracts/eval/report.md × 6)
- [x] Every family reaches target 935/1100 with all 8 dimensions above thresholds (90/120/90/90/60/90/60/60)

## Notes
Score normalization: contract rubric is 8-dimension / 1100-scale (rubrics/contract.md); family finals 1037/1046/1074/1076/1084/1067 average 1064/1100 → 967 on the 0-1000 record scale. Task body references a '6-dimension rubric (1000-point)' — template drift; the actual loaded rubric was used. session-loop passed at iteration 1 (no revision); the other 5 families each consumed one revision round (2/3 iterations). Family conventions now uniformly enforced: oracle channels only in fixture_spec.state_requirements, FT-xxx inline anchors, SessionLink declarations with absence pins, disposable-fixture setup in state_requirements. Residual findings recorded above feed T-consolidate-specs.
