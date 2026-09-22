# Decisions Manifest

> 类型文件按需创建:仅当对应类别出现首条决策时才建文件(不预置空文档)。8 类标准词表:architecture / interface / data-model / dependencies / error-handling / testing / security / local-dev-deployment,允许自定义类别(如 product)。

## Categories

| Category | Type File | Decisions | Last Updated |
|----------|-----------|-----------|--------------|
| Architecture | architecture.md | 2 | 2026-09-20 |
| Interface | interface.md | 1 | 2026-09-20 |
| Dependencies | dependencies.md | 2 | 2026-09-20 |
| Testing | testing.md | 1 | 2026-09-20 |
| Local Dev & Deployment | local-dev-deployment.md | 1 | 2026-09-19 |
| Product | product.md | 1 | 2026-09-19 |

## Recent Decisions

| Date | Feature | Type | Decision | Source |
|------|---------|------|----------|--------|
| 2026-09-20 | dsh-forge-m1 | dependencies | vendor 闭包获取定稿:源码投影+闭包解析,弃整树产物拷贝 | dsh-forge-m1/design/tech-design.md §Open Questions |
| 2026-09-20 | dsh-forge-m1 | architecture | 本仓采用 pnpm workspace(apps/ + packages/)布局 | dsh-forge-m1/design/tech-design.md §Overview |
| 2026-09-20 | dsh-forge-m1 | architecture | Electron 壳路线整体继承上游 apps/desktop,不自选替代框架 | dsh-forge-m1/design/tech-design.md §Overview |
| 2026-09-20 | dsh-forge-m1 | interface | session-focus 经 carrier 注入通道实现,spike 验证,fallback=前置+toast | dsh-forge-m1/design/tech-design.md §Interfaces |
| 2026-09-20 | dsh-forge-m1 | dependencies | desktop-host 以 vendor 源码投影获取,按上游 commit SHA 精确锁定 | dsh-forge-m1/design/tech-design.md §Overview |
| 2026-09-20 | dsh-forge-m1 | testing | 测试栈定为 vitest 单测 + Playwright _electron e2e + 三平台 CI 矩阵 | dsh-forge-m1/design/tech-design.md §Testing |
| 2026-09-19 | dsh-forge-m1 | product | 应用显示名与 profile 目录名定为 dsh-forge,弃用 desktop-ce 旧建议 | dsh-forge-m1/prd/prd-spec.md §Scope |
| 2026-09-19 | dsh-forge-m1 | local-dev-deployment | forge surface 类型无 desktop,项目 surface 配置按 web 近似 | dsh-forge-m1/prd/prd-ui-functions.md §Navigation |
