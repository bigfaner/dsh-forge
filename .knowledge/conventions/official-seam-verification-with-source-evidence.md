---
title: 官方缝核销须带源码行号证据
summary: 技术设计引用官方机械时，每条核销决策附官方 checkout 内 file:line 证据；评审方对证据做抽验，行号全属实则结论可信，路径简写须补全前缀。
keywords: [官方缝, 核销, 源码证据, review]
domainPath: docs/conventions/reuse-official-mechanisms.md
来源容器: expert-squad
来源任务: 评审环节（review-tech-report §3 抽验 6 处）
bug id: 无
---

# 官方缝核销须带源码行号证据

## 惯例

- 设计期每条官方缝决策（D1-D4 形态）附 `packages/.../file.ts:行号` 引用；评审方按比例抽验，逐字比对文档句与源码。
- 证据路径写完整前缀（`packages/` 下），不用 checkout 相对简写——行号对了但路径缺前缀，后人重找成本高（评审 N1 判例）。
- 核销范围须覆盖「本 host 可用性」，不止官方 app 内先例存在性。

## 实证

expert-squad tech-design §13 六处抽验行号全部属实，评审据此采信结论、把返工面收窄到装配归属单项（B1）；弃选决策留痕官方缝行号与重评条件，后续可低成本重评。
