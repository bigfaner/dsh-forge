---
title: 运行期装配面真机取证 AC 前置入提案
summary: 子会话工具可见性、模型派发等运行期装配面验收，必须在提案期即写明取证环境、取证方式与归档位置——事后被评审拦截补写是一轮可避免的返工。
keywords:
  - 真机取证
  - 验收
  - 装配面
  - AC
  - 提案
domainPath: .knowledge/conventions/
来源容器: expert-squad-forge
来源任务: first-pass 复盘（1.7）
bug id: 无
id: runtime-assembly-evidence-ac-in-proposal
status: unconfirmed
type: conventions
version_ts: '2026-11-05T00:00:00.000Z'
related_doc: docs/conventions/external-dependency-verification.md
---

# 运行期装配面真机取证 AC 前置入提案

## 规则

凡验收条目落在运行期装配面（子会话创建窗口、子进程/网络/外部文件系统），提案期即逐条写明：

- 取证环境（哪台宿主、什么派发路径）
- 取证方式（实测记录 / 报错截图 / 会话记录字段）
- 归档位置（提案目录 walkthrough/）

参照 AGENTS 1.4 外部依赖装配面结算门：fake 契约测试全绿不算交付。

## 依据

expert-squad-forge 首评 Blocker B2 即「验收 6/7 未写取证方式与环境」；返工补齐后真机走查一次通过（walkthrough/1.5）。若首评即入 AC，可省一轮返工。
