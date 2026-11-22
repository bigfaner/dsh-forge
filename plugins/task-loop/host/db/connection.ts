// host/db/connection.ts——task-loop.db 域装配（plugin-task-loop 1.6，code-design §2/§6）：
// 基于 lib/db openDatabase（WAL / busy_timeout / foreign_keys 三参数逐连接设置——
// foreign_keys 为 per-connection PRAGMA，lib 侧回读断言非 1 即抛错拒开，I4 处方①）；
// 独立版本线（task-loop.db 新线 v1 单事务落地，entities.md §3 DDL 单源直落）+
// task_ 前缀域装配（六表名单源）+ project_key 派生注入（归属键 DAO 单点——调用方零裸 SQL）。
import { join } from "node:path";
import type Database from "@dsh-forge/lib-db";
import { openDatabase } from "@dsh-forge/lib-db";
import {
  TASK_LOOP_DB_SCHEMA_DOMAIN,
  TASK_LOOP_DB_SCHEMA_VERSION,
  TASK_LOOP_MIGRATIONS,
  taskTableNames,
  type TaskDbTables,
} from "./migrations/version-1.js";
import { deriveProjectKey } from "./repositories/project-key.js";

export interface DomainDbOpts {
  /** 库文件覆盖（':memory:' 供域逻辑测试；缺省 = {home}/forge/db/task-loop/task-loop.db） */
  file?: string;
}

export interface DomainDb {
  db: Database.Database;
  tables: TaskDbTables;
  /** project_key 派生注入（cwd 纯函数派生——写点唯一取径，空 cwd 拒写）。 */
  projectKeyOf(cwd: string): string;
}

/** task-loop.db 落点：{DSH_HOME}/forge/db/task-loop/task-loop.db。 */
export function domainDbFileName(home: string): string {
  return join(home, "forge", "db", "task-loop", "task-loop.db");
}

/**
 * 打开（或创建）task-loop.db 并装配域面（表名单源 + 归属键派生注入）。
 * 三参数（WAL / busy_timeout=5s / foreign_keys）由 lib/db openDatabase 随连接设置；
 * foreign_keys 回读断言不达即抛错拒开（约束静默失效零容忍）。
 */
export function openDomainDb(home: string, opts: DomainDbOpts = {}): DomainDb {
  const file = opts.file ?? domainDbFileName(home);
  const db = openDatabase(file, {
    migrations: TASK_LOOP_MIGRATIONS,
    schemaVersion: TASK_LOOP_DB_SCHEMA_VERSION,
    // 分域版本线锚（R3-dba）：版本门只判读 task-loop 域版本线——共库形态下 spec/knowledge
    // 先行迁移抬升的异域版本行不触发拒开（bug e62f3458 处方；单装形态语义不变）。
    domain: TASK_LOOP_DB_SCHEMA_DOMAIN,
  });
  return {
    db,
    tables: taskTableNames(),
    projectKeyOf: deriveProjectKey,
  };
}
