# Decisions Manifest

> 类型文件按需创建:仅当对应类别出现首条决策时才建文件(不预置空文档)。8 类标准词表:architecture / interface / data-model / dependencies / error-handling / testing / security / local-dev-deployment,允许自定义类别(如 product)。

## Categories

| Category | Type File | Decisions | Last Updated |
|----------|-----------|-----------|--------------|
| Architecture | architecture.md | 11 | 2026-09-22 |
| Interface | interface.md | 1 | 2026-09-20 |
| Dependencies | dependencies.md | 3 | 2026-09-22 |
| Testing | testing.md | 1 | 2026-09-20 |
| Local Dev & Deployment | local-dev-deployment.md | 1 | 2026-09-19 |
| Product | product.md | 1 | 2026-09-19 |

## Recent Decisions

| Date | Feature | Type | Decision | Source |
|------|---------|------|----------|--------|
| 2026-09-22 | dsh-forge-m2 | architecture | SQLite 内核 M2 全落:node:sqlite 内建,自有 SoT 与派生快照分区,快照可重建 | dsh-forge-m2/design/tech-design.md §Overview/§Data Models |
| 2026-09-22 | dsh-forge-m2 | architecture | 必备插件不可禁用 = 双层防护:清单 mandatory 只读分区 + 覆盖文件仅纳第三方 + 守卫 | dsh-forge-m2/design/tech-design.md §Interface 4 |
| 2026-09-22 | dsh-forge-m2 | architecture | 工作台渲染载体 = forge 核心插件注入上游 GUI,导航槽位优先,插件内 rail 降级 | dsh-forge-m2/design/tech-design.md §Overview D3 |
| 2026-09-22 | dsh-forge-m2 | architecture | 数据面分工:主数据走 Electron 内核 IPC,forge CLI 执行面走插件 host 半身 | dsh-forge-m2/design/tech-design.md §Architecture |
| 2026-09-22 | dsh-forge-m2 | architecture | DF003 感知 = fs.watch 递归 + 400ms debounce + 2s 轮询兜底;来源序 actor→挂接推断 | dsh-forge-m2/design/tech-design.md §Interface 3 |
| 2026-09-22 | dsh-forge-m2 | dependencies | 依赖树视图引擎定 @xyflow/react,经插件 bundle 引入不进壳 | dsh-forge-m2/design/tech-design.md §Dependencies |
| 2026-09-20 | dsh-forge-m1 | dependencies | vendor 闭包获取定稿:源码投影+闭包解析,弃整树产物拷贝 | dsh-forge-m1/design/tech-design.md §Open Questions |
| 2026-09-20 | dsh-forge-m1 | architecture | 本仓采用 pnpm workspace(apps/ + packages/)布局 | dsh-forge-m1/design/tech-design.md §Overview |
| 2026-09-20 | dsh-forge-m1 | architecture | Electron 壳路线整体继承上游 apps/desktop,不自选替代框架 | dsh-forge-m1/design/tech-design.md §Overview |
| 2026-09-20 | dsh-forge-m1 | interface | session-focus 经 carrier 注入通道实现,spike 验证,fallback=前置+toast | dsh-forge-m1/design/tech-design.md §Interfaces |
