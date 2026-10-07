---
title: "文档面渲染与路径守卫约定"
domains: [mermaid, rendering, path-guard, dangling, open-external, lazy-load]
---

# 文档面渲染与路径守卫约定

> 工作区文档读域（forgeDocs + 文档 dock tab）：mermaid 渲染纪律与文档读路径守卫（悬空容错）。

## 图渲染

### TECH-doc-001: mermaid 渲染纪律

**Requirement**: 产品依赖 mermaid 包（精确 pin + lockfile）；懒加载——仅文档 tab 含 mermaid 块时动态 import（零块零加载）；securityLevel='strict'（库默认 sanitize，禁 click 回调交互）；erDiagram = 验收锚，全图型同库渲染；渲染失败 / 非法源回退纯文本占位卡（异常不外溢）。
**Source**: feature/dsh-forge-m2-pipeline TECH-010（tech-design §Dependencies·§Security Mitigations ⑦——2026-10-06 用户裁决 / apps/web/src/views/docs）

## 路径守卫与悬空

### TECH-doc-002: 文档读路径守卫与悬空容错

**Requirement**: readDoc resolve 后必须 startsWith(canonical(forge_dir))，越界 = ERR_DOC_PATH_INVALID；「在编辑器中打开」= openExternal 仅 main 侧执行、先经桥校验路径在册（projectHead 路径集 = 该工作区 feature_documents ∪ proposals 的 rel_path canonical 解析全集，越界即拒）；文档引用悬空（模拟分支切换）→ 只读占位面：路径栏保留、不崩溃、不写入、不删行。
**Source**: feature/dsh-forge-m2-pipeline TECH-011（tech-design §Interface 4·§Security Mitigations ①②·SC-branch / packages/core/src/forge/small-domains/docs.ts）
