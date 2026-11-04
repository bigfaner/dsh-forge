---
title: 涉运行期装配面的交付必须有真机取证 AC
summary: >-
  命令注册、宿主装配、进程副作用类交付，行为断言 AC 全绿不算完备——验收必须写明真机取证三要素（取证方式 + 取证环境 +
  归档落点）；workspace-artifact-governance
  提案缺此条款被人工评审与走查任务双向拦截，补齐后两枚新指令的真机回执/截图/分析回合全文成为唯一可信交付证据。
keywords:
  - 真机取证
  - 验收条款
  - 运行期装配面
  - AC
  - slash 指令
domainPath: .knowledge/conventions/
来源容器: workspace-artifact-governance
来源任务: 1.4（真机走查）+ 提案评审 B1
bug id: 无
id: real-machine-evidence-ac-for-runtime-assembly
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
related_doc: docs/conventions/external-dependency-verification.md
---

# 涉运行期装配面的交付必须有真机取证 AC

## 规则

交付面触及运行期装配（指令注册、宿主服务缝合、子进程/文件系统副作用）时，验收条款必须包含真机取证三要素：

- **取证方式**：在真实宿主实敲目标指令/流程，留回执截图 + 数据面实况（目录、gitignore、消息全文）；
- **取证环境**：写明宿主形态与插件装载通道（如「本仓 dev 宿主，profile.dev junction 装载插件源」）；
- **归档落点**：`<forgeDir>/docs/proposals/<slug>/walkthrough/`（留盘不进 git）。

## 实证

- 提案评审（report.md B1）：`/forge-dir-init`、`/forge-dir-audit` 是真实注册 + 真实文件系统副作用交付，仅行为断言 AC 不够，判 Blocker 不放行；补验收 7 后复审清零。
- 执行期验证了该条款的价值：两轮真机走查共发现 fake/单测测不出的问题——junction 装载面错位、main 检出宿主指令注册失效、bug 25ecb14d（followup `undefined.send`）。

## 反例边界

- 纯函数、纯文档、无运行时副作用的交付不适用——单测断言即足够，强制真机取证是浪费（该提案的 prompt 模板文本断言走 vitest，未加真机条款）。
- 与「外部依赖装配面结算门 = 真机端到端取证」正本（AGENTS 1.4 / docs/conventions/external-dependency-verification.md）同向，本判例把该纪律前移到**提案验收条款编写期**。
