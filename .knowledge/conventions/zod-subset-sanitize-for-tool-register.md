---
title: 工具注册门的 zod schema 子集净化
summary: 官方 dsh-tools register 门只接受 schema 关键字子集，裸 zod 产物带 $schema/minLength/anyOf/type 数组等关键字会被拒；注册前做「受支持子集净化」，处理器内校验仍是唯一强制闸。
keywords: [zod, dsh-tools, register, schema, 官方门]
domainPath: docs/conventions/reuse-official-mechanisms.md
来源容器: expert-squad
来源任务: 1.9（D-4，phase-2-summary.md）
bug id: 无
---

# 工具注册门的 zod schema 子集净化

## 配方

- 落地时发现：官方 register 门拒绝子集外关键字（`$schema`、`minLength`、`anyOf`、type 数组等）。
- 净化只放宽模型面的形状描述，**处理器内 zod 校验不删**——校验语义不变，被拒关键字清单锚定在源码注释。
- 此类官方门契约属设计盲区高发区：设计文档不会写「register 门收什么 schema」，须靠实现期首次接入门时沉淀回写。
