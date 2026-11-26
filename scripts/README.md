# scripts/ 运维脚本速查

## migrate-state-db.mjs——forge 状态库迁移

一次性迁移脚本，两个用途互斥：

### ①-④ 旧世界路径（plugin-project 1.18 / plugin-task-loop 1.16 判例）

旧 state.db 拆行 + 工作区库 bugs/task-loop 搬行 + forge-workspaces 目录搬迁——详见脚本头部注释。
（本仓历史已跑过，仅重放场景使用。）

### `--bundle` 段：旧 dsh-forge home → forge-bundle 桌面库（forge-aggregate-bundle 1.43）

```powershell
# 一参速用（推荐）——缺省目标 %APPDATA%\dsh-desktop\harness，缺省源 %APPDATA%\dsh-forge
node scripts/migrate-state-db.mjs --bundle

# 显式指定（非缺省安装位置时才需要）
node scripts/migrate-state-db.mjs --bundle --home <桌面home> --source <旧home>

# 逐步跳过
node scripts/migrate-state-db.mjs --bundle --skip-bundle-bugs --skip-bundle-tasks --skip-bundle-specs
```

搬什么：

| 步 | 源 → 目标 | 规则要点 |
|---|---|---|
| bugs | 旧 `forge/db/project/project.db` → 桌面 `forge/db/forge/forge.db` `project_bugs` | project_key 无目标项目行 → 隔离区；recurrence 断链 → 人工清单 |
| tasks | 旧 `forge/db/task-loop/task-loop.db` 六表 → `task_tasks` 等 | feature 容器任务剔除；无项目行剔除；fix 前驱不在迁移集 → NULL+人工清单 |
| proposals→specs | 旧 `forge/workspaces/*/forge.db` → `spec_specs`/`spec_docs`/`spec_transitions` | rejected/superseded 不迁；draft→draft / under-review→awaiting_approval / accepted→approved；mode/superseded_by/author 进 transition note |

安全纪律：

- **执行前关闭 dsh desktop**——目标库排他打开，宿主在场即中止。
- staged 快照 + 原子替换；回滚点 = 旁侧 `forge.db.pre-bundle-migrate-<时间戳>`。
- 幂等：`bundle_migrate_state` 逐步 fingerprint，源未变重跑自动跳过。
- 人工清单/诊断日志落 `forge/db/forge/bundle-migrate-manual-review.md`、`migrate-bundle-diag.log`。

### `--forge-dirs` 段：存量目录并轨 forge 根（forge-dirs-unification §2.8）

独立模式，一参即可跑；只跑本段，不触①-④与 bundle 段。人工执行，执行前关闭 dsh desktop。

```powershell
node scripts/migrate-state-db.mjs --forge-dirs [--home <DSH_HOME>] [--registry <snapshot.json>] [--stamp <YYYYMMDDTHHmmss>]
```

搬什么：

| 步 | 源 → 目标 | 说明 |
|---|---|---|
| experts | `{DSH_HOME}/experts` → `{DSH_HOME}/forge/experts` | 整目录搬迁 |
| projects 并入 | `{DSH_HOME}/forge/projects/` 下按工作树路径派生命名的目录 → 以项目 projectKey 命名的目录 | 日志并入同名不覆盖：冲突方改名 `原文件名.conflict-<时间戳>` 保留 |

安全纪律：

- 完成标记 = `{DSH_HOME}/forge/migrate-forge-dirs.json`，逐项记录已完成搬迁；写标记在旧目录改名之前。
- 旧目录成功后改名 `原目录名.pre-migrate-<时间戳>` 保留，不删除；改名失败即中止。
- 幂等：已完成项重跑跳过；目标目录在场且无完成标记时拒绝执行并报错。
- 不迁移：旧 `{DSH_HOME}/knowledge/knowledge.db`（内容已全部在现行库）与两个空的 knowledge-global 目录。

## 其它脚本

- `bump-version.mjs`：插件版本 bump 唯一正道（node JSON 往返；禁文本替换——eaea8cea 判例）。
- `package-release.mjs`：forge bundle 打包（WYSIWYG；缺省输出 `release/forge-bundle/{version}`）。
- `migrate-forge-db-ac-columns.mjs`：存量 forge.db 后加列补齐。
- `check-package-json.mjs`：依赖声明机检（build/dev 前置）。
