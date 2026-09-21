---
id: "2"
title: "HOST_PROFILE_BUNDLES 配置化与对账默认回退"
priority: "P0"
estimated_time: "4h"
complexity: "high"
dependencies: [1]
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.feature"
mainSession: false
---

# 2: HOST_PROFILE_BUNDLES 配置化与对账默认回退

## Description
bundle 清单当前焊死在壳代码常量(`apps/desktop/src/main/host-profile/index.ts` 的 `HOST_PROFILE_BUNDLES`),任何自有插件进壳都必须改壳代码,直接违反「一切皆插件」。本任务把清单迁出为产品级配置(插件树唯一事实源),并以默认回退机制(壳侧启动期差集调和)实现「配置→存量 userData profile」两层对账语义;M2 UF6 启停将读写同一配置。

## Reference Files
- `docs/proposals/ui-plugin-foundation/proposal.md` — Scope > In Scope(HOST_PROFILE_BUNDLES 配置化)、Success Criteria(SC2)、Non-Functional Requirements(冷启动预算)、Key Risks(SC2 删除腿)
- `apps/desktop/src/main/host-profile/index.ts` — `HOST_PROFILE_BUNDLES` 常量迁出点;既有投影为「存在即跳过」写一次语义 (ref: Problem > Evidence)
- `scripts/acceptance/live-ui-probe.mjs` — 冷启动计时口径,扩展前后各归档一次测量 (ref: Non-Functional Requirements)
- `packages/desktop-host-vendor` — 上游 profile 物化机制源码参照(只读) (ref: Problem > Evidence)

## Acceptance Criteria
- [ ] bundle 清单从壳代码常量迁至产品级配置(文件形态与读取时机任务内定,如壳资源内 JSON/YAML),配置成为插件树唯一事实源
- [ ] 新增条目腿:仅修改配置,hello-world 在壳内生效装配(经任务 1 的包)
- [ ] 删除条目腿:对账默认回退 = 壳侧启动期差集调和(读产品配置与投影差集,清理产品清单已删条目的物化),存量 userData profile 物化被清理/失效(验行为结果,不绑定实现)
- [ ] 两次增删操作的壳代码 diff = 0(git diff 验证)
- [ ] 产品清单条目对运行时启停只读(防第二写入方破坏产品清单)
- [ ] 冷启动预算(扩展后 live-ui-probe 口径):相对 M1 基线增量 ≤ 5% 且绝对值 ≤ 100ms,基线与改造后各归档一次测量,超预算即回归

## Hard Rules
- 增删插件不得改动壳代码(两次操作 git diff = 0)。
- 任何执行点判定「必备」所依据的插件身份清单必须派生自产品级配置,禁止以壳代码常量重现(架构约束③)。

## Implementation Notes
- 对账候选机制(提案已定界,默认回退落地):① 壳侧启动期差集调和(npm `prune` 同构原型;与「不发明旁路」的相容性要点 = 调和只做清理/失效、不新增装配通道;默认项);② 上游原生移除通道(以源码核查/spike 确认存在性与语义,若存在可替换①)。裁决过程留档任务记录。
- 既有投影写一次语义:不假设配置变更自动传播;调和只针对壳自管的 userData 投影,零侵入上游代码。
- 配置缺失/损坏/非法时壳启动行为要有明确处理(错误路径,不允许启动崩溃静默)。
- M1 验收面(SC7 UI 对等、SC9 崩溃恢复)保持绿;live-ui-sweep 扩展覆盖配置化路径。
