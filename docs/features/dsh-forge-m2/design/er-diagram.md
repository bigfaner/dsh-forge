---
created: "2026-09-22"
related: design/tech-design.md
---

# ER Diagram: dsh-forge M2 需求与会话工作台

> 载体:SQLite(`node:sqlite`,Electron 主进程内嵌),库文件 `<userData>/workbench/workbench.db`,WAL 模式。
> 事实源纪律:`projects` / `app_state` / `session_links` = 工作台自有 SoT;`task_snapshot` / `feature_snapshot` / `sync_state` = **派生缓存,可整体重建**(事实源 = forge 文件)。

## Entity Relationships

```mermaid
erDiagram
    projects ||--o{ session_links : "注册项目拥有挂接索引(SoT)"
    projects ||--o{ task_snapshot : "派生任务快照(可重建)"
    projects ||--o{ feature_snapshot : "派生 feature 快照(可重建)"
    projects ||--o| sync_state : "快照健康度(1:1)"

    projects {
        text id PK "uuid"
        text display_name "目录名可改"
        text code_root UK "绝对路径,注册时规范化"
        text doc_location_type "in_repo | external"
        text doc_location_path "external 时非空且 != code_root"
        text created_at "ISO 8601 UTC"
        text last_activated_at "单激活由 app_state 承载"
    }
    app_state {
        text key PK "active_project_id 等"
        text value "JSON 编码"
    }
    session_links {
        text id PK "uuid"
        text project_id FK "CASCADE"
        text task_key "forge 任务 ID 如 2.1"
        text session_id "dsh 会话标识"
        text status "active | ended"
        text started_at "ISO 8601 UTC"
        text ended_at "ended 时非空"
    }
    task_snapshot {
        text project_id PK_FK "CASCADE,复合 PK"
        text task_key PK_FK "复合 PK"
        text feature_slug "所属 feature"
        text title "任务标题"
        text status "7 态 CHECK"
        text blockers "JSON 数组:上游 key 列表"
        text branch "执行 git 分支,可空"
        integer worktree "0 | 1"
        text source "session | terminal,可空"
        text updated_at "最近变更时间戳"
    }
    feature_snapshot {
        text project_id PK_FK "CASCADE,复合 PK"
        text feature_slug PK_FK "复合 PK"
        text status "manifest 词表透传"
        text doc_kinds "JSON 数组:实际存在的文档类"
        integer task_total "任务总数(派生计数)"
        integer task_completed "已完成数"
        text updated_at "ISO 8601 UTC"
    }
    sync_state {
        text project_id PK_FK "CASCADE"
        text last_scan_at "最近成功扫描"
        text status "idle | scanning | error"
        text error "error 时可带原因(<=120 字符)"
    }
```

## Entity Details

### projects [NEW]

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK, NOT NULL | `crypto.randomUUID()`(主进程生成) |
| display_name | TEXT | NOT NULL | 显示名;缺省 = code_root 目录名;仅注册表层字段,不改磁盘 |
| code_root | TEXT | NOT NULL, UNIQUE | 代码根目录绝对路径(规范化:分隔符/尾斜杠统一) |
| doc_location_type | TEXT | NOT NULL, CHECK IN ('in_repo','external') | 文档位置三分模型 |
| doc_location_path | TEXT | NULL | external 时必填;in_repo 恒 NULL;注册/重指向时校验 ≠ code_root 且可读 |
| created_at | TEXT | NOT NULL | ISO 8601 UTC |
| last_activated_at | TEXT | NULL | 激活迁移时间(单激活真值在 app_state) |

行级约束:`CHECK (doc_location_type='in_repo' AND doc_location_path IS NULL OR doc_location_type='external' AND doc_location_path IS NOT NULL)`。

### app_state [NEW]

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| key | TEXT | PK, NOT NULL | 保留键:`active_project_id`;后续视图偏好等可扩展 |
| value | TEXT | NOT NULL | JSON 编码字符串 |

单激活不变量由应用层在事务内维护(读-改-写 + 唯一键),不设外键(value 为 JSON 无法引用);移除激活项目时代码路径显式迁移/清空。

### session_links [NEW]

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK, NOT NULL | uuid |
| project_id | TEXT | NOT NULL, FK → projects(id) ON DELETE CASCADE | 挂接归属项目 |
| task_key | TEXT | NOT NULL | forge 任务 ID(如 "2.1");不设 FK——任务实体在 forge 文件侧 |
| session_id | TEXT | NOT NULL | dsh 会话标识(DF004 通道产物;fallback 通道下为应用侧生成句柄) |
| status | TEXT | NOT NULL, DEFAULT 'active', CHECK IN ('active','ended') | 会话结束事件驱动迁移;无事件通道时由下次发起/显式操作收敛 |
| started_at | TEXT | NOT NULL | 发起时间 |
| ended_at | TEXT | NULL | status='ended' 时非空(app 层维护) |

UNIQUE(project_id, task_key, session_id):防重复挂接;同一任务多次会话 = 多行(挂接历史)。

### task_snapshot [NEW]

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| project_id | TEXT | NOT NULL, FK → projects(id) ON DELETE CASCADE, 复合 PK | 归属项目 |
| task_key | TEXT | NOT NULL, 复合 PK | forge 任务 ID |
| feature_slug | TEXT | NOT NULL | 所属 feature 目录名 |
| title | TEXT | NOT NULL | 任务标题 |
| status | TEXT | NOT NULL, CHECK 7 态 | pending/in_progress/completed/blocked/suspended/skipped/rejected(forge 词表) |
| blockers | TEXT | NOT NULL, DEFAULT '[]' | JSON 数组:直接上游 blocker 的 task_key 列表 |
| branch | TEXT | NULL | 任务执行 git 分支(执行痕迹,PRD 2026-09-22 增补;无则 NULL) |
| worktree | INTEGER | NOT NULL, DEFAULT 0 | 0/1 |
| source | TEXT | NULL, CHECK IN ('session','terminal') | 最近一笔变更来源(Interface 3 判定序产物) |
| updated_at | TEXT | NOT NULL | 最近变更时间戳(列表视图列) |

派生缓存:整体 DROP+重建不影响正确性;indexer 全量重扫 upsert,结构性删除在 diff 中同步删除行。

### feature_snapshot [NEW]

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| project_id | TEXT | NOT NULL, FK → projects(id) ON DELETE CASCADE, 复合 PK | 归属项目 |
| feature_slug | TEXT | NOT NULL, 复合 PK | feature 目录名 |
| status | TEXT | NOT NULL | manifest status 词表透传:'prd'/'design'/'tasks'/'in-progress'/'completed'(连字符形与 manifest 一致,展示层同词) |
| doc_kinds | TEXT | NOT NULL, DEFAULT '[]' | JSON 数组:实际存在的文档类(⊂ manifest/prd/design/ui/tasks;驱动 UF4 tab disabled) |
| task_total | INTEGER | NOT NULL, DEFAULT 0 | 派生计数 |
| task_completed | INTEGER | NOT NULL, DEFAULT 0 | 派生计数 |
| updated_at | TEXT | NOT NULL | manifest/任务集最近变更 |

### sync_state [NEW]

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| project_id | TEXT | PK, FK → projects(id) ON DELETE CASCADE | 1:1 |
| last_scan_at | TEXT | NULL | 最近成功扫描完成时间 |
| status | TEXT | NOT NULL, DEFAULT 'idle', CHECK IN ('idle','scanning','error') | scanning 由 indexer 事务外置位 |
| error | TEXT | NULL | error 态原因(≤120 字符,对齐 M1 failure.detail 口径) |

## Index Design

| Table | Index Name | Columns | Type | Description |
|-------|------------|---------|------|-------------|
| session_links | idx_session_links_project | project_id | B-tree | 项目挂接列表(UF3 挂接历史) |
| session_links | idx_session_links_task | project_id, task_key | B-tree | 任务→挂接查询(角标/来源推断兜底) |
| task_snapshot | idx_task_snapshot_feature | project_id, feature_slug | B-tree | feature 筛选(UF2 筛选器/UF4 计数) |
| task_snapshot | idx_task_snapshot_status | project_id, status | B-tree | 状态分组视图 B 列 |
| feature_snapshot | idx_feature_snapshot_updated | project_id, updated_at | B-tree | 列表排序(更新时间) |

规模预算(PRD):≤500 任务/项目、≤50 feature/项目、≤20 项目——以上索引覆盖看板全部查询路径,单库峰值 ~10⁴ 行级,无需分表/分库。

## Relationships

| From | To | Cardinality | Business Meaning |
|------|----|-------------|------------------|
| projects | session_links | one-to-many | "项目拥有多笔任务↔会话挂接(挂接索引)" |
| projects | task_snapshot | one-to-many | "项目的派生任务快照(可重建)" |
| projects | feature_snapshot | one-to-many | "项目的派生 feature 快照(可重建)" |
| projects | sync_state | one-to-one | "项目快照健康度" |
| app_state(键值) | projects | 引用(JSON 内 project id) | "单激活指针(active_project_id)" |
| task_snapshot.blockers | task_snapshot | 自引用(JSON key 列表) | "blocker 依赖边(UI 视图层组装传递链)" |

## Change Impact Analysis

全部实体 [NEW],无存量表变更——不适用(无 [MODIFIED])。
