---
status: "completed"
started: "2026-09-22 01:52"
completed: "2026-09-22 02:03"
time_spent: "~11m"
---

# Task Record: 5 三项未验证项 spike 结论落档

## Summary
三项未验证项 spike 结论落档:创建 spike-report.md(装配路线 ① plugin add 对壳 profile 行为 / ② out-of-tree 物化解析 link: 与 tarball 两形态 / ③ inject 非官方声明方语义含子集 vs ui-goal 7 边全集对照),每项按 Hard Rules 落「结论 + 独立退路」两栏且退路按项独立(两锚解析显式注明非 ② 退路);落档 hello-world 分发形态结论(tarball 随包内置 + 壳侧预播种物化,npm 物化按离线 NFR 否决)与离线自足兼容性声明;并入任务 3 撞键三型结论与 SC6 移交语;附录 A 内联 15 条源码级事实(锚定 vendored pinnedSha c36ba648,上游本地 checkout 已前移故以本仓 vendored 投影为唯一权威),含两处对技术方向文档推断的修正(inject 无整体 boot 校验、缺席目标静默跳过、硬校验点在物化期 require;plugin add 对 desktop profile 被上游 CLI 显式拒绝);§6 给出 M2 门控结论(三项未推翻,可开工)与条件修正路线条款。全部结论为源码级或实测,外部证据(DSH Studio)显式标注。

## Changes

### Files Created
- docs/features/ui-plugin-foundation/spike-report.md

### Files Modified
无

### Key Decisions
无

## Document Metrics
~230 lines: 3 spike items (each with conclusion + independent fallback two-column form), 1 distribution-form adjudication table + NFR compatibility statement, 1 collision three-type archive + SC6 handover, 1 M2 gating section + conditional correction-route clause, 15-row inlined source-fact appendix (SHA-anchored)

## Referenced Documents
- docs/proposals/ui-plugin-foundation/proposal.md
- docs/proposals/dsh-forge/ui-plugin-vendor-free.md
- docs/features/ui-plugin-foundation/tasks/3-dsh-web-assembly-collision.md
- docs/features/ui-plugin-foundation/dsh-web-assembly-evidence.md
- docs/features/ui-plugin-foundation/version-gate-evidence.md
- vendor/upstream.lock.json

## Review Status
final

## Acceptance Criteria
- [x] ① plugin add 对壳 profile 目录行为:源码级结论 + 独立退路(内置 bundle 清单路线,独立于 plugin add)
- [x] ② out-of-tree 物化解析(dev link: 与 prod tarball 两形态分述):结论 + 独立退路(npm 发布或 tarball 随包内置;显式注明两锚解析属解析锚非物化通道)
- [x] ③ inject 非官方声明方语义:最小稳定子集 vs ui-goal 全集 7 边两组对照,子集合法/等价性落档(误读防御:子集合法未触发退回全集,非官方声明方可行性由源码钉死)
- [x] hello-world 分发形态结论以证据定夺(tarball 随包内置 + 预播种物化;npm 物化否决)+ 离线自足 NFR 兼容性声明
- [x] 源码级事实内联并锚定 checkout SHA c36ba648,不传递依赖技术方向文档现状;M2 门控结论 + 条件修正路线条款落档

## Notes
源码核查锚定 packages/desktop-host-vendor/vendored(上游本地 checkout HEAD 已移至 4052914c,不再等于钉定 SHA);关键修正性发现:CLI args.ts 的 rejectElectronProfile 在 boot 与 plugin 双路径显式拒绝 --profile desktop(① 的最强证据);S0/S1 的 bare 包物化(零 peers)全绿为 §4 预播种结论提供直接实测支撑;报告为任务 6 打包腿(AC4 按本结论执行)与 M2 槽位设计(SC6 移交语)的前置输入。
