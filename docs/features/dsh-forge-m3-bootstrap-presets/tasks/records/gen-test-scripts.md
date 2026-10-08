---
status: "completed"
started: "2026-10-08 15:24"
completed: "2026-10-08 16:00"
time_spent: "~36m"
---

# Task Record: T-test-gen-scripts Generate Web E2E Test Scripts

## Summary
由 forge:gen-test-scripts（--type web）从 9 旅程 44 合约 122 Outcome 生成 Web E2E 测试脚本：e2e/specs/m3/ 九 spec 23 test 函数（每旅程一文件 + ≥1 冒烟）。断言源 = 各旅程 contracts（eval-contract 全过 850 阈：890–1010/1100）。形态沿仓既定口径：输出目录偏离裁决（tests/ 两门皆漏 → e2e/specs/m3/，M2/p1mvp 前例）；载体 = 回放主径（createBridgeDriver 五写动词）+ RPC 单发读面 + 概览 UI 锚（anchors.ts 台账）+ openForgeDbAt 库级断言；零真实模型（Hard Rule）。生成门三件套全绿：tsc -p e2e/tsconfig.json --noEmit 零错 + oxlint 九文件零告警 + playwright --list 23 tests/9 files 装载实证；pnpm lint 全绿 + vitest 2901/2901（未触产品源）。无 e2e 通道/已有承载面的 Outcome 按诚实映射落文件头（dogfood/SC 套件/5.1 pin 池/worker-face/log-chain/presets.test/ForgeSettingsSection.test 交叉引用——不伪造断言）。Assertion depth 各文件头记 92-95% behavioral、38-42% deep（两阈均过）。运行归 T-test-run。

## Changes

### Files Created
- e2e/specs/m3/blitz-direct-chain.spec.ts
- e2e/specs/m3/bootstrap-walkthrough.spec.ts
- e2e/specs/m3/expedition-full-sdd-chain.spec.ts
- e2e/specs/m3/gate-and-submit-discipline.spec.ts
- e2e/specs/m3/mode-selection-alignment.spec.ts
- e2e/specs/m3/overview-entry-new-session.spec.ts
- e2e/specs/m3/preset-physical-isolation.spec.ts
- e2e/specs/m3/proposal-review-mode-transition.spec.ts
- e2e/specs/m3/worker-provisioning.spec.ts

### Files Modified
无

### Key Decisions
无

## Cases Generated
122

## Cases Evaluated
N/A

## Scripts Created
- e2e/specs/m3/blitz-direct-chain.spec.ts
- e2e/specs/m3/bootstrap-walkthrough.spec.ts
- e2e/specs/m3/expedition-full-sdd-chain.spec.ts
- e2e/specs/m3/gate-and-submit-discipline.spec.ts
- e2e/specs/m3/mode-selection-alignment.spec.ts
- e2e/specs/m3/overview-entry-new-session.spec.ts
- e2e/specs/m3/preset-physical-isolation.spec.ts
- e2e/specs/m3/proposal-review-mode-transition.spec.ts
- e2e/specs/m3/worker-provisioning.spec.ts

## Test Results
122 outcomes（44 合约）全量映射：87 项落 e2e 断言（23 test 函数承载），35 项诚实映射至在场承载面（dogfood-sc-m3/SC1-SC7·uf3/5.1 pin 池/worker-face·log-chain 支撑池/presets.test/ForgeSettingsSection.test/M2 fix-chain 系）。生成门：tsc e2e 零错、oxlint 零告警、playwright --list 23/9 装载实证、pnpm lint 全绿、vitest 2901/2901。覆盖自检 web 9/9 旅程零缺口。

## Acceptance Criteria
- [x] MUST invoke Skill(forge:gen-test-scripts) 生成脚本（禁手写测试）
- [x] 读任务定义并发现测试目录布局（9 旅程 × contracts）
- [x] eval 门前置：全部合约 eval-contract 过 850 阈（890–1010/1100）
- [x] 每旅程 ≥1 冒烟测试（happy path 全链）
- [x] Outcome 全量映射：e2e 断言或诚实映射（头注台账）
- [x] Assertion depth ≥80% behavioral 且 ≥30% deep（各文件头记数）
- [x] 编译门：tsc e2e 零错 + oxlint 零告警 + playwright --list 装载实证
- [x] 覆盖自检：web surface 旅程数 = 脚本数（9 = 9，零缺口）
- [x] 测试隔离：全部 mkdtemp 独立世界 + closeApp/rmDirBestEffort 收尾，零共享树变异

## Notes
关键裁决：① 输出目录沿 M2 偏离口径（e2e/specs/m3/——tests/ 双门皆漏）；② 官方设置对话框开启通道在 e2e 无先例锚——worker-provisioning Step1 表单三态与 mode-selection Step1b/1c 诚实映射至 ForgeSettingsSection.test.tsx + sc2 数据面（不伪造 UI 断言）；③ preset-physical-isolation 故障注入（底稿变异）违反隔离铁则——映射 presets.test/materialize.test/3.9 实证；④ 依赖环夹具走 db 直插（addTask 增量环校验拒绝构造环——唯一受控初态通道）；⑤ localId 语义核对：常规任务 1.1 起步（非纯整数）、fix-N/disc-N 前缀顺延（链深 ≤6 第七层拒）。
