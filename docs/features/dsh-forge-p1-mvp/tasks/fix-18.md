---
id: "fix-18"
title: "Fix: DSH_HOME 默认共享用户真 home（~/.dsh）——API Key 等凭据/配置复用原生 dsh（S1 隔离 pin 按产品裁决翻案），e2e 隔离语义经 DSH_FORGE_USER_DATA 隐式保留"
priority: "P1"
estimated_time: "2h"
complexity: "medium"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix: DSH_HOME 默认共享用户真 home（复用原生 dsh 凭据/配置）

> 来源：走查人（2026-10-03）「api key 的加载与解析等能力复用原生 dsh。现在 dsh userhome 已有相关配置，为什么还提示要添加？」—— 根因 = 产品自 S1 起**刻意隔离** DSH_HOME 到应用数据目录（paths.ts:65 `dshHome: {userData}/dsh-home`，S1 pin「runProfile 触碰 $DSH_HOME，产品须隔离」），真实 `~/.dsh/.credentials.yaml` 不在读取路径 → 官方 llm-deepseek 引导按无凭据正常提示。**产品属主裁决翻案：产品是同一用户 dsh 环境的伴生窗口，凭据/配置应共享。**

## Description

**DSH_HOME 解析优先级变更**（paths.ts + main.ts）：

1. `DSH_FORGE_DSH_HOME` 显式指定 → 用之（新增测试/调试口）
2. `DSH_FORGE_USER_DATA` 在场（e2e/隔离场景）→ 沿用 `{userData}/dsh-home`（**既有 e2e 全套零改动**——它们都设 USER_DATA）
3. 缺省（人用 dev `pnpm run dev` / 打包形态）→ **`os.homedir()/.dsh` 真用户 home**

共享面（随真 home 生效）：`.credentials.yaml`（API Key 加载/解析——原生 llm-deepseek 插件直读，产品仍零经手凭据）、dsh 会话账本、设置用户层、workspace 注册表（注册链 dsh create 落真 registry——与官方桌面同一工作区集合）。**应用私有面不变**：state.db / knowledge-bindings.json / Electron userData 仍归应用（paths.ts 既有字段）。

## 行为预期与边界

- 真 home 有 deepseek-official 凭据 → 「添加一个 API Key」引导不再自动弹出（官方按凭据在场判定）
- 真 home 仅有其他 provider（如 zai/pi-ai 布局）而无 deepseek-official 行 → 引导仍会提示（**官方语义如此**，非缺陷）；可选缓解：产品暴露 `dshDesktop` 宿主标记（官方桌面经此抑制该引导，client.js:4010）——**单独裁决项**：该全局还门控其他官方行为面，须先清点官方消费面再定，不并入本任务
- 会话/工作区共享后：左栏会话列表 = 真 home 账本实时读（SC2 直读语义不变）；与官方桌面并行使用同一 home 的写并发由 dsh 账本层自持（官方运行时既有机制）

## Reference Files

- apps/host/src/profile/paths.ts（:65 dshHome 解析——本任务核心）+ paths.test.ts（优先级三态用例）
- apps/host/src/main.ts（:37 `DSH_HOME ??=` 消费点）
- 官方（只读参照）：dsh-client-ui-settings-models/client.js:4010（credentialOnboarding && !dshDesktop）、:1114（deepseek-official 行判定）
- e2e 全套（DSH_FORGE_USER_DATA 隐式隔离——回归面）；4.2 flywheel（其「凭据拷贝进隔离 DSH_HOME」机制不变）

## Acceptance Criteria

- [ ] 解析优先级三态单测（显式 DSH_FORGE_DSH_HOME > USER_DATA 隐式隔离 > 缺省真 home）
- [ ] 人用路径实测：dev `pnpm run dev` 裸跑（无 USER_DATA env）→ API Key 引导**不再自动弹出**（真 home 凭据被原生插件读到；执行记录附对照）或若 deepseek-official 行缺配 → 引导在场但填入后经 credentials.set 落**真 home**（官方通道，产品零经手）
- [ ] e2e 全套零改动全绿（隔离语义保持：所有 e2e 设 USER_DATA → dsh-home 隔离）
- [ ] 打包形态同口径（userData 天然应用私有，但 DSH_HOME 缺省走真 home）
- [ ] state.db / bindings / userData 私有面回归（路径断言不变）
- [ ] tsc + lint 绿；S1 pin 注记翻案记录（本任务 = 产品属主裁决）

## User Stories

- Story 2（日常会话）：配置过 API Key 的用户开箱即用（零重复配置）。

## Hard Rules

- **凭据纪律不变**：产品代码零经手凭据（读取/写入全官方插件通道——credentials.set 唯一机密写面）。
- dsh 底子：home 语义对齐官方桌面（共享用户环境）；不自创配置迁移/合并逻辑（真 home 即真相源）。
- e2e 隔离不破：任何 e2e 不得触真 home（USER_DATA 隐式隔离 + 显式覆盖口双保险；执行记录核查全套 e2e env）。

## Implementation Notes

- 实现落点小：paths.ts dshHome 三态解析 + main.ts 消费不变（??= 已兼容）+ paths.test 三态用例。
- 风险预记：真 home 的 sessions/settings 与官方桌面并发使用——dsh 运行时自持并发语义（同官方双开桌面行为），异常面归上游；如遇账本锁/写冲突记录观察项。
- dshDesktop 标记抑制引导：另案裁决（先清点官方消费面清单再立项，本任务 Notes 留线索）。
