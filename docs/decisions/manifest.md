# Decisions Manifest

> 类型文件按需创建:仅当对应类别出现首条决策时才建文件(不预置空文档)。8 类标准词表:architecture / interface / data-model / dependencies / error-handling / testing / security / local-dev-deployment,允许自定义类别(如 product)。

## Categories

| Category | Type File | Decisions | Last Updated |
|----------|-----------|-----------|--------------|
| Architecture | architecture.md | 16 | 2026-09-23 |
| Interface | interface.md | 2 | 2026-09-23 |
| Data Model | data-model.md | 4 | 2026-09-24 |
| Dependencies | dependencies.md | 3 | 2026-09-22 |
| Testing | testing.md | 1 | 2026-09-20 |
| Local Dev & Deployment | local-dev-deployment.md | 1 | 2026-09-19 |
| Product | product.md | 1 | 2026-09-19 |

## Recent Decisions

| Date | Feature | Type | Decision | Source |
|------|---------|------|----------|--------|
| 2026-09-24 | dsh-forge-m4 | data-model | subagent 挂接 = 血缘推断 + 任务 id+title 命名辅助,session_links 不扩列;回写后置 M5 | dsh-forge-m4/prd/prd-spec.md §必答⑥ |
| 2026-09-24 | dsh-forge-m4 | data-model | workspaceRegistry 单向投影(归档保留/删除移除;禁反向写;降级不阻断) | dsh-forge-m4/prd/prd-spec.md §必答④⑤ |
| 2026-09-23 | dsh-forge-m3 | architecture | systemPrompt 预合成归内核(三要素确定性组装 + prompt_hash),host 仅持 subagent 创建 | dsh-forge-m3/design/tech-design.md §Interface 3 |
| 2026-09-23 | dsh-forge-m3 | architecture | 任务状态机载体 = TS 原生移植入内核(7 态 + 依赖解析),Go 对拍器保证行为等价 | dsh-forge-m3/design/tech-design.md §Overview 裁决 T1 |
| 2026-09-23 | dsh-forge-m3 | architecture | dsh tool→内核通道 = renderer 桥接(host rpc→client 半身→IPC 白名单),零新增监听面 | dsh-forge-m3/design/tech-design.md §Interface 2 裁决 T2 |
| 2026-09-23 | dsh-forge-m3 | architecture | 已迁移项目外部写 = 幂等自动重摄入 + 偏离标记,不阻断外部会话 | dsh-forge-m3/design/tech-design.md §Interface 4 裁决 T3 |
| 2026-09-23 | dsh-forge-m3 | data-model | 阶段资产 = stages/<stage>.md 单一规范文件,元数据入 stage_asset 索引 | dsh-forge-m3/design/tech-design.md §Interface 5 裁决 T4 |
| 2026-09-23 | dsh-forge-m3 | data-model | 偏好存储 = 单表 prefs(scope, scope_id, key)三级 scope 化,键集封闭 | dsh-forge-m3/design/tech-design.md §Data Models |
| 2026-09-23 | dsh-forge-m3 | interface | 工具写集仅对 data_authority='sqlite' 项目开放,files 项目提示走 CLI | dsh-forge-m3/design/tech-design.md §Interface 2 权限界 |
| 2026-09-22 | dsh-forge-m2 | architecture | SQLite 内核 M2 全落:node:sqlite 内建,自有 SoT 与派生快照分区,快照可重建 | dsh-forge-m2/design/tech-design.md §Overview/§Data Models |
| 2026-09-22 | dsh-forge-m2 | architecture | 必备插件不可禁用 = 双层防护:清单 mandatory 只读分区 + 覆盖文件仅纳第三方 + 守卫 | dsh-forge-m2/design/tech-design.md §Interface 4 |
| 2026-09-22 | dsh-forge-m2 | architecture | 工作台渲染载体 = forge 核心插件注入上游 GUI,导航槽位优先,插件内 rail 降级 | dsh-forge-m2/design/tech-design.md §Overview D3 |
