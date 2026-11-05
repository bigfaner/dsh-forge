---
title: 内置件不可卸载用结构性保证，不用运行时守卫
summary: >-
  「不可卸载」由呈现形态结构性保证——内置件条目走 `plugins.item` 官方组形态，ItemDetail
  天然无卸载按钮（与官方四件同构），不需要代码级隐藏/禁用逻辑；「默认开」由 host
  装载独立保证（装载不依赖列表呈现），列表项纯属呈现面。结构选对了，性质就是免费的；运行时守卫永远有被绕过与漏改的风险。
keywords:
  - 结构性保证
  - 不可卸载
  - plugins.item
  - 呈现面
  - 装载面解耦
domainPath: .knowledge/conventions/
来源容器: builtin-plugin-item-presentation
来源任务: 1.10（判据产生于本容器真机走查 batch-1）
bug id: 无
id: structural-guarantee-uninstallable
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 内置件不可卸载用结构性保证，不用运行时守卫

## 规则

- 交付物的「性质类」要求（不可卸载/不可见/不可改），优先选**结构性保证**：选一个该性质天然成立的官方形态/机制，而不是在自选形态上加守卫代码去补性质。
- 呈现面与装载面解耦：列表/详情呈现可以整条消失（如 whileServed 门控），不影响装载与运行态——性质判定不依赖呈现是否在场。

## 实证

builtin-plugin-item-presentation 走查 batch-1（2026-11-02）：专家团 item 详情页 DOM 全文无「卸载」按钮，与官方子智能体详情页一致；对照已安装 bundle 详情页有「卸载」——不可卸载由 `plugins.item` 官方组形态结构性成立，零守卫代码。

## 反例边界

- 官方形态与所需性质有微差时如实记录而非强凑（本例：官方子智能体表单带「保存」按钮、内置件无——差异源于表单声明而非自绘，同属官方 configForms 机械，不算性质违背）。
- 性质要求涉及运行时动态条件（按用户/角色变化）时结构性保证不适用，需运行时判定。
