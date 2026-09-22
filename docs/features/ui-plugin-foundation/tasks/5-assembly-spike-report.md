---
id: "5"
title: "三项未验证项 spike 结论落档"
priority: "P0"
estimated_time: "4h"
dependencies: [3]
type: "doc"
mainSession: false
---

# 5: 三项未验证项 spike 结论落档

## Description
装配路线三项关键行为当前仍是推断/外部证据:① `dsh plugin add` 对壳自有 profile 目录(userData 下)的行为;② profile node_modules 物化对 out-of-tree bundle 的解析(dev `link:` 与 prod tarball 两形态);③ `inject` 依赖边以非官方包为声明方的完整语义。本任务汇集源码级与实测证据,产出 spike 报告——结论按项独立落档「结论 + 独立退路」两栏,并给出 hello-world 到达打包态/离线壳的分发形态结论。这是 M2 设计的门控输入,不是文档练习。

## Reference Files
- `docs/proposals/ui-plugin-foundation/proposal.md` — Scope > In Scope(三项未验证项结论落档)、Success Criteria(SC4)、Key Risks(spike 兜底按项独立)
- `docs/proposals/dsh-forge/ui-plugin-vendor-free.md` — §8 未验证项原始论证(引用基线钉在 git 提交 `6f5b109`,后续修订不传递影响)
- `packages/desktop-host-vendor` — 源码级核查对象(锚定 checkout SHA `c36ba648`) (ref: Constraints & Dependencies)
- `docs/features/ui-plugin-foundation/tasks/3-dsh-web-assembly-collision.md` — 任务 3 产出的 dsh web 侧验证记录(证据来源之一)

## Affected Files

### Create
| File | Description |
|------|-------------|
| `docs/features/ui-plugin-foundation/spike-report.md` | 三项未验证项「结论 + 独立退路」两栏落档 + inject 子集对照 + 分发形态结论 + 离线兼容性声明 |

### Modify
| File | Changes |
|------|---------|
| (无) | — |

### Delete
| File | Reason |
|------|--------|
| (无) | — |

## Acceptance Criteria
- [ ] ① `plugin add` 对壳 profile 目录行为:源码级或实测结论 + 独立退路(退路 = 内置 bundle 清单路线,独立于 `plugin add`)
- [ ] ② out-of-tree 物化解析(dev `link:` 与 prod tarball 两形态分述):结论 + 独立退路(退路 = npm 发布或 tarball 随包内置;显式注明两锚解析属 inject 目标解析锚、不构成 ② 的退路)
- [ ] ③ inject 非官方声明方语义:含最小稳定子集 vs ui-goal 全集(上游实测 7 边)两组 inject 声明对照,子集合法/等价性随结论落档(子集不合法则退回全集,不误读为「非官方声明方不可行」)
- [ ] hello-world 到达打包态/离线壳的分发形态结论(候选:npm 物化 / tarball 内置 / 预播种,以证据定夺不预判)+ 与离线自足 NFR 的兼容性声明
- [ ] 报告内联所依赖的源码级事实(锚定 checkout SHA `c36ba648`),不传递依赖技术方向文档现状;任一项被推翻时给出修正路线并门控 M2 设计

## Hard Rules
- 每项未验证项强制「结论 + 独立退路」两栏;退路按项独立、不得互相挪用(两锚解析 ≠ 物化通道)。

## Implementation Notes
- 证据等级要求:源码级或实测,不接受纯推断;外部证据(如 DSH Studio)须标注为外部证据。
- 撞键三型结论(任务 3)与撞键 fixture 证据并入本报告归档。
- 报告同时是任务 6 打包腿的形态输入与 M2 槽位设计的前置输入(SC6 移交语)。
