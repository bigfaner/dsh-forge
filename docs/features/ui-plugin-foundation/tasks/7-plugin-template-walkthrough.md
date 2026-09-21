---
id: "7"
title: "插件包工程模板与第三方走查演示"
priority: "P1"
estimated_time: "3h"
complexity: "high"
dependencies: [4]
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.feature"
mainSession: false
---

# 7: 插件包工程模板与第三方走查演示

## Description
基座的最终检验是「第三方可以照做」:把 hello-world 沉淀为可复用工程模板,内建槽位消费/贡献标准姿势与 dsh UI 组件复用约定,补齐第三方两处「第一步」(依赖安装的 peer 声明形态、装进宿主的版本兼容声明),并以真实走查验证——从零新建插件包到官方 `dsh web` 注入成功,全程零 vendored 引用、零壳修改。

## Reference Files
- `docs/proposals/ui-plugin-foundation/proposal.md` — Scope > In Scope(插件包工程模板)、Success Criteria(SC5)、Non-Functional Requirements(模板面向第三方)
- `packages/plugins/hello-world` — 沉淀源(任务 1 产出,双向扩展标准姿势)
- `tests/smoke.spec.ts` — 版本戳断言挂接点(任务 4 同源机制) (ref: Success Criteria)

## Acceptance Criteria
- [ ] hello-world 沉淀为可复用模板(目录与产出方式任务内定:degit / 脚本 / 文档化参照,定夺后留档理由),内建槽位消费/贡献标准姿势与 dsh UI 组件复用约定
- [ ] 模板 peer 声明为 npm 形态(禁 `workspace:^` 照抄),对齐线依赖 exact `0.1.6-alpha.2`
- [ ] 模板含 engines 式宿主版本兼容声明,且经任务 4 同源机制盖版本戳(模板流出侧版本同步可见、可断言)
- [ ] 模板文档面向第三方用户,不要求读者接触 dsh-forge 仓的 vendored 树;明示禁裸包名/`^`(dist-tag 陷阱)
- [ ] SC5 走查:按模板文档从零新建插件包 → 官方 `dsh web` 注入成功,演示链路覆盖两处「第一步」,零 vendored 引用、零壳代码修改,演示记录归档

## Hard Rules
- 模板产物禁含任何 `workspace:` 协议依赖与仓内 `file:` 引用(流出后即坏)。

## Implementation Notes
- 模板即 VS Code「yo code + engines.vscode」范式在 dsh 生态的对应物:模板起步 + 版本门禁。
- 走查演示记录(命令序列 + 结果截图/日志)归档为 SC5 证据,与任务 6 的 live-ui-probe 证据分属不同链路(第三方走查 vs 壳内装配)。
- 上游 SHA 升级时模板版本戳与断言、插件依赖同 diff bump(任务 4 纪律)。
