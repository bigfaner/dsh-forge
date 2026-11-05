---
title: bug→blocked→fix 链→复验清零的返工闭环范式
summary: >-
  真机取证暴露产品缺陷时，worker 不带病通过也不自行扩大修复面：bug 现场登记（recordBug 留证）→ result=blocked
  结算附失败摘录 → 派生 fix 任务独立修复 → 同 AC 全量复验清零。workspace-artifact-governance 1.4
  全程零谎报、返工增量 0%，fix 密度 12.5%（1/8 任务）。
keywords:
  - fix 链
  - blocked
  - 复验
  - 返工闭环
  - bug 台账
domainPath: .knowledge/examples/
来源容器: workspace-artifact-governance
来源任务: 1.4（001-walkthrough blocked → 003-rerun 复验）
bug id: 25ecb14d
id: bug-blocked-fix-rerun-closed-loop
status: unconfirmed
type: lessons
version_ts: '2026-11-05T00:00:00.000Z'
---

# bug→blocked→fix 链→复验清零的返工闭环范式

## 范式

真机取证打到产品缺陷（非环境、非测试缺陷）时的标准动作序列：

1. **现场登记**：bug 记入台账（含失败摘录、触发条件、证据截图路径）；
2. **blocked 留证结算**：已过 AC 如实报 PASS、被阻 AC 如实 FAIL，不谎报不裁剪；
3. **fix 独立修复**：派生 fix 任务，最小修复面 + 插件版本 patch bump（0.14.0 → 0.14.1）；
4. **同 AC 全量复验**：换环境重跑全部 AC（非只测失败项），证据归档新事件子文件夹（003-rerun）。

## 实证

bug 25ecb14d：`/forge-dir-audit` followup 分析回合稳定报 `Cannot read properties of undefined (reading 'send')`（shot-08）→ fix-1（b9b258f3）→ gov3 复验 116 tests + 全 AC 通过（shot-17、transcript-audit-full.txt）。复盘（1.8 retro §2.2）判定全程零额外调度损耗。

## 边界

- 环境类失败不走红线：先分类（判例 classify-environment-failures-from-assertion-failures），环境问题换环境/修环境，不登记产品 bug。
- 复验必须同 AC 全量：只验失败项会漏掉修复对已过 AC 的回归（本轮 junction/宿主切换即环境变更，全量复验是必要非冗余）。
