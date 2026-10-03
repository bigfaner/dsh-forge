---
id: "fix-12"
title: "Fix(P0): 预览版说明模态无法关闭——官方 welcome ack volatile 写在产品宿主下静默丢弃（阻断所有新用户）"
priority: "P0"
estimated_time: "3h"
complexity: "high"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.fix"
mainSession: false
---

# Fix(P0): 预览版说明模态无法关闭——welcome ack volatile 写静默丢弃

> 来源：走查人实机（2026-10-03，`pnpm run dev`）「预览版说明对话框无法关闭，提示：无法保存确认状态」。**P0 阻断**：fresh 用户（dev 与安装形态同因）首启即被模态卡死，应用完全不可用。
> 临时解卡：`$env:DSH_FORGE_PATCH_FILES="$PWD\tmp-ui-review\ack.yml"; pnpm run dev`（[tmp-ui-review/ack.yml](../../../tmp-ui-review/ack.yml) 已就位）。

## Root Cause（四轮探针 + 官方源码勘面，2026-10-03，复现 4/4）

官方链路（`dsh-client-ui-settings-models/lib/client.js:2663-2760` `WelcomeNoticeStore`）：确认 = `ctx.configForms.get('ui-settings-general')` scope → `scope.set('welcomeNoticeVersion','2026-09-28.1')` → **回读精确等值比对** → 未持久 = `welcomeError「暂时无法保存确认状态，请重试」`且 `finish()` 不调用（模态不关，重试无效）。字段 volatile（`dsh-client-ui-settings-general`：`z.string().volatile()`；README：「宿主端在条目 Config 声明 volatile 字段，经既有公开 settings 边界读写」「非 loopback 确认仅进程内」）。

**产品宿主实测**：① 传输层干净（HTTP 全 2xx / 无 pageerror / 无 console error）；② **写零落盘**（userData 仅 Chromium 内部变化、`~/.dsh` 零变化、localStorage 新增仅为官方 dock 布局存储无 welcome 键）；③ 刷新后说明再现。结论：volatile 写在产品宿主形态（boot child + 薄宿主 webserver）被**静默丢弃**——读路径通（`DSH_FORGE_PATCH_FILES` 预置能让说明不出现 = profile merge 读取正常），写路径无效。4.2 记录「点继续写回不可依赖」同因，当时 e2e 以预确认叠层绕过未修——**本缺陷漏网 = e2e 全预确认盲区**。

**待插桩分叉（修复定性）**：(a) volatile 持久层依赖官方桌面宿主能力（`dshDesktop` 全局面先例：client.js:4010）而薄宿主未提供；(b) child 形态 configForms 服务 volatile 存储未持久化；(c) RPC 层静默拒绝（响应携错被 scope 吞）。

## Description

两层修复：

1. **解卡（P0 立即）**：产品 boot overlay（既有机制）内置预置 `ui-settings-general.config.welcomeNoticeVersion = <官方当前版本常量 2026-09-28.1>`——产品形态下说明不再出现（产品非官方桌面分发面；版本常量随上游 pin 冻结，建常量 pin 测试随升级窗口机械核查）。
2. **根因收口（插桩定性后）**：三分叉择一处置——宿主能力缺口则评估薄宿主补 volatile 持久面（经 bridge 落 userData store）；或显式采「确认进程内化」口径（scope.mode=memory 官方既定回退：模态可关、刷新再现，产品可接受则最轻）；RPC 静默拒绝则修通道。

## Reference Files

- 官方（只读参照）：`dsh-client-ui-settings-models/lib/client.js:2663-2760,2951,3067`；`dsh-client-ui-settings-general/lib/index.js` + 两包 README
- 产品：apps/host/src/boot/（overlay 机制——解卡落点；child 形态插桩点）、apps/host/src/ipc/
- 复现/证据脚本：tmp-ui-review/welcomeprobe{,2,3,4}.mjs；临时解卡 tmp-ui-review/ack.yml
- 关联：4.2「写回不可依赖」注记；SMOKE-LEDGER §6 预确认叠层记载

## Acceptance Criteria

- [ ] 解卡：fresh userData 裸启动（无 DSH_FORGE_PATCH_FILES）dev + 打包两形态**说明模态不再出现**
- [ ] 根因定性入执行记录（三分叉择一 + 插桩证据）
- [ ] e2e 补真实路径用例：fresh 启动不预置叠层走真实验证（消除本盲区）；既有 e2e 预确认叠层改由产品 overlay 承载后全绿、断言语义不弱化
- [ ] tsc + lint + 定向单测绿

## User Stories

- 全部故事的前置：fresh 用户能进入应用。

## Hard Rules

- 官方 welcome 模态 UI 逻辑零改写；产品只动 overlay/宿主能力面。
- dsh 底子纪律；上游 pin 不动。

## Implementation Notes

- 打包形态同步：installer-smoke fresh 用例曾靠预确认叠层——解卡后改裸跑回归。
- 与 fix-11 并行注意 index.json 协作（该任务 in_progress 中）。
