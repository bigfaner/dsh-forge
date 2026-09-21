---
id: "1"
title: "hello-world 双向扩展插件包"
priority: "P0"
estimated_time: "4h"
complexity: "high"
dependencies: []
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.feature"
mainSession: false
---

# 1: hello-world 双向扩展插件包

## Description
M2 全部 forge 能力 UI 须以 dsh 客户端插件形态交付,但当前仓库没有任何自有插件存在。本任务创建工程基座的第一个自有插件 hello-world:以纯 npm 依赖起包、零 vendored 文件引用,演示消费既有稳定槽位 + 贡献自有子槽位的双向扩展,为后续装配验证、撞键 fixture、模板沉淀提供载体。形态参照上游 `ui-goal`(空宿主半身 + client 半身经 `exports["./client"]`)。

## Reference Files
- `docs/proposals/ui-plugin-foundation/proposal.md` — Proposed Solution(交付件行为①)、Scope > In Scope、Success Criteria(SC1)、Constraints & Dependencies(上游锁定)
- `packages/desktop-host-vendor` — 上游 `ui-goal` 最小样例形态参照(只读,零侵入) (ref: Non-Functional Requirements)
- `vendor/upstream.lock.json` — `desktopHostVersion`(0.1.6-alpha.2)对齐基准 (ref: Constraints & Dependencies)
- `tests/smoke.spec.ts` — 仓内 vitest 编排参照(新增插件包测试挂接点)

## Acceptance Criteria
- [ ] npm 起包:对齐线依赖(`@deepseek-ai/dsh-client-*` 宿主契约族)一律 exact `0.1.6-alpha.2`,禁裸包名与 `^`;cordis peer 为独立版本线单列(不与 desktopHostVersion 比对)
- [ ] 零 vendored 文件引用:依赖解析全部指向 npm registry,无 `vendor/` 路径前缀、无仓内 `file:` 协议
- [ ] client 半身经 `exports["./client"]` 暴露,空宿主半身,包形态参照上游 `ui-goal`(小包)
- [ ] 注入一个既有稳定槽位(ui-slots / ui-chat / ui-renderer 核心槽之一),hello-world 面板渲染进该槽位所在既有界面区域
- [ ] 经 `register` 贡献一个自有子槽位 + store 席位(声明合并),子槽位渲染默认内容
- [ ] 交互闭环:点击面板 → client 半身 store 席位状态更新 → 刷新渲染,证明运行链路而非静态注入

## Hard Rules
- 对齐线依赖一律 exact `0.1.6-alpha.2`(借 `alpha` tag 定位须解析并锁定为 exact 结果),禁裸包名与 `^`(dist-tag `latest` 停旧版 0.0.1-rc.1 实测陷阱)。

## Implementation Notes
- workspace 落位(提案 Next Steps 原列 tech-design 待决,quick 模式下本任务内定):建议 `packages/plugins/hello-world/`,与 vendored 树物理隔离;定夺后在任务记录留档理由。
- 目标稳定槽位以 spike 预判 + 实测定夺,子集不合法则退回 ui-goal 全集(见任务 5 对照结论)。
- 包体积与构建产物面以上游 `ui-goal` 为参照:宿主半身可空、client 半身小包。
- 上游 0.1.x alpha 演进期:上游 SHA 升级时本包依赖与断言(任务 4)同 diff bump。
