---
id: "6"
title: "壳内双环境装配与打包/闭包验收腿"
priority: "P1"
estimated_time: "3h"
complexity: "high"
dependencies: [2, 5]
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.feature"
mainSession: false
---

# 6: 壳内双环境装配与打包/闭包验收腿

## Description
双环境可移植性是本基座的一等验收:同一 hello-world 插件既要在官方 `dsh web`(任务 3)也要在 dsh-forge 壳内完成装配,且壳内装配必须走产品级配置路径(不引入新的壳内硬编码);第三腿为打包/闭包形态验收(具体分发形态由任务 5 spike 结论定),并落档与离线自足 NFR 的兼容性结论。本任务扩展 M1 验收基建采集证据。

## Reference Files
- `docs/proposals/ui-plugin-foundation/proposal.md` — Success Criteria(SC1 三腿)、Key Scenarios(双环境装配)、Non-Functional Requirements(离线自足)
- `apps/desktop` — 壳侧装配路径(经任务 2 产品级配置) (ref: Key Scenarios)
- `scripts/acceptance/live-ui-probe.mjs` — 扩展为壳内装配证据采集(DOM/截图归档) (ref: Success Criteria)
- `docs/features/ui-plugin-foundation/spike-report.md` — 分发形态结论(打包腿输入,任务 5 产出)

## Acceptance Criteria
- [ ] 同一 hello-world 插件在 dsh-forge 壳内经产品级配置装配成功,不引入新的壳内硬编码
- [ ] 注入的基座槽位与贡献的自有子槽位在两侧环境均可见渲染,以扩展后的 live-ui-probe 采集 DOM/截图证据归档
- [ ] 两侧环境呈现一致:面板渲染、子槽位默认内容、点击 → store 更新 → 刷新交互行为一致
- [ ] 打包/闭包形态验收腿按 spike 分发形态结论执行并留档(npm 物化 / tarball 内置 / 预播种之一)
- [ ] 该腿与离线自足 NFR 的兼容性结论显式落档(打包态离线运行验证)

## Hard Rules
- 壳内装配零新硬编码:任何插件身份不得以壳代码常量出现。

## Implementation Notes
- 继承 M1 NFR 全项:离线自足、进程足迹 = 2、无监听端口、零侵入上游、`$DSH_HOME` 多装共存。
- M1 验收面(SC7 UI 对等、SC9 崩溃恢复)在扩展后验收基建下保持绿。
- 若打包腿暴露离线不兼容(npm 物化需网络),以 spike 报告的退路(tarball 内置/预播种)处置并在证据中记录。
