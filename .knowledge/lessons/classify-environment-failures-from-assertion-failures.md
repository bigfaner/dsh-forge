---
title: 环境级失败与断言失败分类隔离
summary: 套件 teardown 的 EPERM Temp 清理失败、沙箱文件权限拒绝等环境级失败，会在全量 vitest 报 success:false——先分类（断言全过 + 仅清理失败 = 环境级），针对性复跑受影响测试面隔离验证，不误判为代码缺陷。
keywords: [EPERM, teardown, 沙箱, 环境失败, 测试分类]
domainPath: docs/conventions/windows-commit-exhaustion.md
来源容器: expert-squad
来源任务: 1.5 D-2、1.15 D-6（phase-1/3-summary.md）
bug id: 无
---

# 环境级失败与断言失败分类隔离

## 判例

- 1.5：`state.test.ts` 套件报 `EPERM: rmdir Temp\expert-squad-state-*`，50/50 断言全过，失败仅套件级 cleanup。
- 1.15：同症状使全量报告 `success:false`（105/105 断言全过）——针对性复跑阶段测试面 32/32 全绿，证实与委派代码无关。

## 处置配方

1. 先看断言计数：断言全过 + 失败落在 afterAll/cleanup → 初判环境级。
2. 针对性复跑受影响功能的测试文件，隔离验证代码面。
3. 环境级记偏差留档，待真机/非沙箱环境观察，不为它改代码。
