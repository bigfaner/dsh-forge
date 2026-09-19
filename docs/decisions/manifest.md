# Decisions Manifest

> 类型文件按需创建:仅当对应类别出现首条决策时才建文件(不预置空文档)。8 类标准词表:architecture / interface / data-model / dependencies / error-handling / testing / security / local-dev-deployment,允许自定义类别(如 product)。

## Categories

| Category | Type File | Decisions | Last Updated |
|----------|-----------|-----------|--------------|
| Local Dev & Deployment | local-dev-deployment.md | 1 | 2026-09-19 |
| Product | product.md | 1 | 2026-09-19 |

## Recent Decisions

| Date | Feature | Type | Decision | Source |
|------|---------|------|----------|--------|
| 2026-09-19 | dsh-forge-m1 | product | 应用显示名与 profile 目录名定为 dsh-forge,弃用 desktop-ce 旧建议 | dsh-forge-m1/prd/prd-spec.md §Scope |
| 2026-09-19 | dsh-forge-m1 | local-dev-deployment | forge surface 类型无 desktop,项目 surface 配置按 web 近似 | dsh-forge-m1/prd/prd-ui-functions.md §Navigation |
