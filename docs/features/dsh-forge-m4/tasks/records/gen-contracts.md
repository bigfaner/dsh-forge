---
status: "completed"
started: "2026-09-30 06:35"
completed: "2026-09-30 06:49"
time_spent: "~14m"
---

# Task Record: T-test-gen-contracts Generate Test Contracts

## Summary
M4 测试 Contract 规格生成(forge:gen-contracts skill,breakdown 模式;eval-journey 门 6/6 过线后执行):6 个 Journey 全部生成 Contract,共 35 个 Contract 文件 / 79 个 Outcome,全部落位 docs/features/dsh-forge-m4/testing/<journey>/contracts/step-N-<action>.md(M3 同构约定:frontmatter + web anchors + state-verification 注记 + 内嵌 fixture_spec + 语义描述符中文承载 + Journey Invariants 原词收尾)。①project-workbench-home(Medium,6 文件 10 Outcome,ON_TARGET 8-12):首屏恢复/空态 hero(validation-error 映射)/全项目树/路径降级切换/三区容器+加载失败(network-error+session-expired 映射)/孤儿清零零缩水/重启恢复+悬挂指针;②project-registration-projection(High,5 文件 13 Outcome,ON_TARGET 13-20):确认卡/侦测五态(valid/missing/registered/parent/nogit,CardPhase 状态机对拍 FT-132)/证据三档+黏性禁令+仓外授权/注册+投影失败降级(DSH_FORGE_PROJECTION_FAULTS 注错缝 FT-128)/派发归组;③project-lifecycle-projection(High,5 文件 16 Outcome,ON_TARGET):投影状态 healthy/degraded/deviation×2/已归档会话区/改名(投影失败+空输入)/归档(跨项目分区)/恢复/删除五支路(显式/归档态/布局隔离/确认取消/投影失败待重试);④split-pane-layout-memory(Medium,6 文件 13 Outcome,ABOVE_TARGET +1)/⑤multi-window-tearout(Medium,6 文件 14 Outcome,ABOVE_TARGET +2)/⑥task-session-roundtrip(Medium,7 文件 13 Outcome,ABOVE_TARGET +1)——三条 Medium 超界均为 eval 过线边角 1:1 映射(合并即丢失 eval 验证覆盖;per-step 均在 2-3;M3 stage-gates Medium=14 同款先例)。代码侦察 38 条新静态事实(FT-098..FT-135,文件+行号引用:IPC 62 动词白名单/窗口动词组与 WindowRole 握手/detached 标题与 OS close≡recall/lineage 100ms 预算与后代上限 20/Interface 6 打开通道/C6 三态/C5 dock 契约/TabKind 五种/比例钳制 0.3-0.7/溢出 5/布局引擎 800ms 去抖+forget 前置+stored 信号+blob v1 形状/投影状态机 4×4+relay 执行序+通道缺席+错误映射+注错缝/注册两条硬校验+docsPlacement 四值/DetectReport/CardPhase/生命周期动词语义/active_project_id 单行指针/事件批量通道)合并入 .forge/fact-table.json(现 135 条)。web anchors 全量取自 design/page-map.md(2026-09-28,与 tech-design 同日=新鲜;视图键+布局态寻址口径,锚到 C3/C5/C6/C7/C8/C10/右栏 dockkit 各面)。schema 校验脚本全绿:35/35 文件 0 错误 0 警告(四维非空/fixture_spec 实体≥1/零 regex 记号/Outcome 名唯一/Journey Invariants 恰一段≥1 条/anchors.web.page 非空/last_anchor_sync ISO-8601);eval-journey 残余攻击点(映射注释承载/a11y 未入步/设置页容器口径)以映射注释+锚定 page-map 实况承接,未擅自改 PRD 口径。

## Changes

### Files Created
- docs/features/dsh-forge-m4/testing/project-workbench-home/contracts/step-1-boot-first-screen.md
- docs/features/dsh-forge-m4/testing/project-workbench-home/contracts/step-2-project-tree-enumeration.md
- docs/features/dsh-forge-m4/testing/project-workbench-home/contracts/step-3-switch-project.md
- docs/features/dsh-forge-m4/testing/project-workbench-home/contracts/step-4-three-zone-container.md
- docs/features/dsh-forge-m4/testing/project-workbench-home/contracts/step-5-forge-views-adoption.md
- docs/features/dsh-forge-m4/testing/project-workbench-home/contracts/step-6-restart-restore.md
- docs/features/dsh-forge-m4/testing/project-registration-projection/contracts/step-1-open-confirm-card.md
- docs/features/dsh-forge-m4/testing/project-registration-projection/contracts/step-2-path-probe.md
- docs/features/dsh-forge-m4/testing/project-registration-projection/contracts/step-3-doc-placement-preview.md
- docs/features/dsh-forge-m4/testing/project-registration-projection/contracts/step-4-confirm-register-project.md
- docs/features/dsh-forge-m4/testing/project-registration-projection/contracts/step-5-dispatch-session-grouping.md
- docs/features/dsh-forge-m4/testing/project-lifecycle-projection/contracts/step-1-projection-status.md
- docs/features/dsh-forge-m4/testing/project-lifecycle-projection/contracts/step-2-rename-project.md
- docs/features/dsh-forge-m4/testing/project-lifecycle-projection/contracts/step-3-archive-project.md
- docs/features/dsh-forge-m4/testing/project-lifecycle-projection/contracts/step-4-restore-project.md
- docs/features/dsh-forge-m4/testing/project-lifecycle-projection/contracts/step-5-delete-project.md
- docs/features/dsh-forge-m4/testing/split-pane-layout-memory/contracts/step-1-single-view-default.md
- docs/features/dsh-forge-m4/testing/split-pane-layout-memory/contracts/step-2-add-split-view.md
- docs/features/dsh-forge-m4/testing/split-pane-layout-memory/contracts/step-3-drag-pane-ratio.md
- docs/features/dsh-forge-m4/testing/split-pane-layout-memory/contracts/step-4-collapse-subagent-descendants.md
- docs/features/dsh-forge-m4/testing/split-pane-layout-memory/contracts/step-5-leave-reenter-restore.md
- docs/features/dsh-forge-m4/testing/split-pane-layout-memory/contracts/step-6-close-to-single-view.md
- docs/features/dsh-forge-m4/testing/multi-window-tearout/contracts/step-1-select-pane-tearout.md
- docs/features/dsh-forge-m4/testing/multi-window-tearout/contracts/step-2-tearout-window.md
- docs/features/dsh-forge-m4/testing/multi-window-tearout/contracts/step-3-parallel-observation.md
- docs/features/dsh-forge-m4/testing/multi-window-tearout/contracts/step-4-recall-window.md
- docs/features/dsh-forge-m4/testing/multi-window-tearout/contracts/step-5-second-tearout-set.md
- docs/features/dsh-forge-m4/testing/multi-window-tearout/contracts/step-6-reenter-restore-tornout.md
- docs/features/dsh-forge-m4/testing/task-session-roundtrip/contracts/step-1-open-task-detail-dock.md
- docs/features/dsh-forge-m4/testing/task-session-roundtrip/contracts/step-2-view-link-history.md
- docs/features/dsh-forge-m4/testing/task-session-roundtrip/contracts/step-3-identify-subagent-session.md
- docs/features/dsh-forge-m4/testing/task-session-roundtrip/contracts/step-4-open-top-session.md
- docs/features/dsh-forge-m4/testing/task-session-roundtrip/contracts/step-5-open-subagent-session.md
- docs/features/dsh-forge-m4/testing/task-session-roundtrip/contracts/step-6-subagent-metadata-roundtrip.md
- docs/features/dsh-forge-m4/testing/task-session-roundtrip/contracts/step-7-session-tree-reverse-badge.md

### Files Modified
- .forge/fact-table.json

### Key Decisions
- Medium 三旅程(Medium 8-12)超界 +1..+2 判 ACCEPTED 不合并:超出量全部来自 eval-journey 过线边角(6.6 条/journey)的 1:1 映射,合并语义相似 Outcome 会丢失 eval 验证覆盖;per-step 计数均在 2-3 区间,surface-required 映射以注释承载;M3 stage-gates-cross-phase-context(Medium=14)同款先例
- web anchors 全量取自 page-map.md 视图键+布局态口径(非 URL):lifecycle 旅程的「项目设置」语义锚定到 page-map 实况「右栏概览·投影状态行」(eval-journey 残余张力 #25 裁撤 vs UF8 旧口径不由 Contract 层擅改,Preconditions/Output 承载旅程语义、anchor 承载实现面)
- 空态/无行类前置以 AppState/LayoutMemory 实体 + state_requirements 表达(fixture_spec 实体≥1 硬约束与『无项目』语义的调和;M3 无先例,本批定式 = 状态实体 + state_requirements 描述)
- eval-journey 残余攻击点承接:session-expired/validation-error/network-error/responsive-layout 以 HTML 映射注释 + source: inferred 落位(双映射房式);a11y 键盘可达性未入 Contract 步骤(与旅程层一致,留给 gen-test-scripts/eval-consistency 对账)

## Cases Generated
79

## Cases Evaluated
N/A

## Scripts Created
无

## Test Results
79 Outcomes across 35 Contract files (6/6 journeys); schema validation 35/35 pass, 0 errors 0 warnings; density: High 13/16 in 13-20 ON_TARGET, Medium 10 ON_TARGET / 13/13/14 ABOVE_TARGET(+1..+2, eval-edge-driven, per-step within 2-3)

## Acceptance Criteria
- [x] At least 1 Contract file generated per Journey
- [x] Each Contract has six-dimension declarations with semantic descriptors (no regex)
- [x] Risk-driven Outcome density targets met per Journey risk level
- [x] Fact Table written to .forge/fact-table.json
- [x] All Contracts passed schema validation

## Notes
test.gen-contracts 为纯规格生成(无可执行脚本),scriptsCreated 空、casesGenerated=79(Outcome 数);提交走 --data JSON(process/ 目录 gitignored)。下游:gen-test-scripts(web surface → Web E2E Test,tests/web/<journey>/ 多 surface 分区或单 surface 平铺——本项目单 web surface,tests/<journey>/ 平铺)。
