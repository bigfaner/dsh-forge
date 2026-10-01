# Decisions Manifest

> 类型文件按需创建:仅当对应类别出现首条决策时才建文件(不预置空文档)。8 类标准词表:architecture / interface / data-model / dependencies / error-handling / testing / security / local-dev-deployment,允许自定义类别(如 product)。

## Categories

| Category | Type File | Decisions | Last Updated |
|----------|-----------|-----------|--------------|
| Architecture | architecture.md | 19 | 2026-10-02 |
| Interface | interface.md | 3 | 2026-09-28 |
| Data Model | data-model.md | 6 | 2026-10-02 |
| Dependencies | dependencies.md | 3 | 2026-09-22 |
| Testing | testing.md | 1 | 2026-09-20 |
| Local Dev & Deployment | local-dev-deployment.md | 1 | 2026-09-19 |
| Product | product.md | 2 | 2026-09-28 |

## Recent Decisions

| Date | Feature | Type | Decision | Source |
|------|---------|------|----------|--------|
| 2026-10-02 | dsh-forge-p1-mvp | architecture | 数据内核合一为 core(双域双服务单句柄),knowledge 仅存 dsh 插件;沉淀分离降为模块级禁令 | dsh-forge-p1-mvp/design/tech-design.md §Architecture |
| 2026-10-02 | dsh-forge-p1-mvp | architecture | 五工件定名 + 子模块基础/业务二分 + 依赖铁律 + 修改落点速查 | dsh-forge-p1-mvp/design/tech-design.md §Monorepo |
| 2026-10-02 | dsh-forge-p1-mvp | data-model | 召回日志单表 knowledge_recall_logs(一行=调用×命中,call_id 分组+哨兵行+快照) | dsh-forge-p1-mvp/design/er-diagram.md §KNOWLEDGE_RECALL_LOGS |
| 2026-10-02 | dsh-forge-p1-mvp | data-model | 关键日志 app_key_logs 仅 warn/error + scope 枚举 + 单事件单条 | dsh-forge-p1-mvp/design/schema.sql §APP_KEY_LOGS |
| 2026-09-28 | dsh-forge-m4 | architecture | 工作台承载 = 原生 home 增强层(conversation + 左栏座位注入 + rightbar forge tabs) | dsh-forge-m4/design/tech-design.md §Overview 裁决 T1 |
| 2026-09-28 | dsh-forge-m4 | interface | 投影写通道 = client relay 直调上游 workspaceController remote,内核期望状态幂等全量重推 | dsh-forge-m4/design/tech-design.md §Interface 2 裁决 T3 |
| 2026-09-28 | dsh-forge-m4 | product | M4 存储边界 = 仅身份+三档+确认卡;影子 git/runtime_root 顺延存储里程碑 | dsh-forge-m4/design/tech-design.md §Overview 裁决 T6 |
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
