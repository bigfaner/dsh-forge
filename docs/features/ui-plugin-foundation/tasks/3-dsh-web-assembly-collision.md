---
id: "3"
title: "官方 dsh web 装配验证与撞键 fixture 实证"
priority: "P0"
estimated_time: "3h"
complexity: "high"
dependencies: [1]
surface-key: ""
surface-type: "web"
breaking: false
type: "coding.feature"
mainSession: false
---

# 3: 官方 dsh web 装配验证与撞键 fixture 实证

## Description
官方 `dsh web` 是第三方用户的真实环境。本任务以第三方视角(经 `dsh plugin add` profile 自装)在官方 web 装配 hello-world,验证两锚解析与版本对齐;并创建撞键复制品 fixture(第二个自装插件,声明与 hello-world 贡献子槽位同名的槽位键),实测 ui-slots 声明合并的撞键行为并按三型归档——单只 hello-world 验不了共存面,这是 M2 真实工作台槽位设计的前置输入。

## Reference Files
- `docs/proposals/ui-plugin-foundation/proposal.md` — Key Scenarios(第三方插件共存)、Success Criteria(SC6)、Key Risks(槽位冲突)、Scope > In Scope(双环境装配验证)
- `packages/plugins/hello-world` — 被装插件与同名槽位键来源(任务 1 产出)
- `packages/desktop-host-vendor` — ui-slots `register` 声明合并契约源码参照(只读) (ref: Key Scenarios)

## Acceptance Criteria
- [ ] hello-world 以 profile 自装(`dsh plugin add`)在官方 `dsh web` 注入成功(第三方视角,零 vendored 引用、零壳修改)
- [ ] 撞键复制品 fixture:第二个自装插件,声明与 hello-world 贡献子槽位同名的槽位键,可独立装配运行
- [ ] 撞键行为实测并按「合并共存 / 分层覆盖 / 启动期显式报错」三型归档,含复现步骤与观察到的 UI 结果
- [ ] 无论落哪一型,「静默后者覆盖且不可观察」视为未通过(结论须可观察、可复现)
- [ ] 该侧两锚解析与版本对齐的验证记录归档(供任务 5 spike 报告引用)

## Hard Rules
- fixture 撞键结论须落档三型之一且附复现步骤;拒绝无规则的静默结果。

## Implementation Notes
- 撞键落档框架对齐 JetBrains extension points 成例:声明合并显式化 + 冲突启动期可见。
- `dsh plugin add` 对壳自有 profile 目录(userData 下)的行为是 spike 未验证项①——本任务在官方 `dsh web` 侧执行,壳侧行为由任务 5 spike 报告单独落档。
- DSH Studio(euanguo/dsh-studio)已验证双形态分发成立(外部证据),本任务复现该链路。
- 版本纪律同任务 1:fixture 包对齐线依赖 exact `0.1.6-alpha.2`。
