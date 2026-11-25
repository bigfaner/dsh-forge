---
title: 声明推导迁移须配等价 pin；正则/扫描口径变更必须 fail-loud
summary: >-
  清单/意图表改扫包声明推导时，迁移前后集合逐成员断言（等价 pin）锁住漏发；扫描正则放宽或口径变更会让「识别面」静默扩张，必须配「扫描值 ≠ 预期 pin
  即红」的 fail-loud 断言，否则口径变化产出假绿。
keywords:
  - 等价 pin
  - fail-loud
  - 声明推导
  - 扫描口径
  - 守卫
domainPath: conventions
status: unconfirmed
source_container: packaging-guard-hardening
source_task: packaging-guard-hardening/1.5
id: declaration-derived-migration-equivalence-pin-fail-loud-regex
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
---

# 迁移与口径变更的 pin 纪律

## 适用条件

- 手维清单/意图表退役、改为扫描包声明（如 `dsh.product`）推导——迁移引入结构性漏发风险。
- 守卫扫描依赖正则识别口径（引号形、扩展名、目录名），口径放宽/变更会改变识别集合。

## 做法

1. **等价 pin 锁迁移**：迁移前后关键集合（staged 集、extras 键集、install 贡献段）逐成员断言相等——结构性防「迁移悄悄少带一个包」。
2. **口径变更配 fail-loud pin**：正则放宽后扫描结果 ≠ 已知预期值即红。放松识别口径会把注释/散文中的匹配也扫进集合（静默扩面），pin 恰好兜住；测变体注入红的同时，勿省略「现行底稿扫描值不变」的显式绿断言。

## 反例边界

- 集合内容本身就是本次有意变更的对象时，pin 值须随变更同提交更新，不能拿旧 pin 拒新事实。
- pin 只防「未声明的变化」，不验证语义正确性——预期值本身错了 pin 照样绿。

## 来源

- 提案 packaging-guard-hardening M2 等价 pin + G3 presetCarriedPlugins 引号形 fail-loud；真机取证 `packaging-guard-hardening/walkthrough/1.5-dist-win-check-hook/`。
