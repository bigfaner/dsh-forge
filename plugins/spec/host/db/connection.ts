// spec.db 域装配（plugin-spec 1.3，code-design §4）——基于 lib/db openDatabase
// （WAL / busy_timeout / foreign_keys 三参数逐连接，I4 断言不达即 fail-closed 拒开）；
// 单装落点 {DSH_HOME}/forge/db/spec/spec.db；归属键谓词 DAO 单点注入
//（三 repo 在此装配，调用方零裸 SQL）。
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDatabase } from "@dsh-forge/lib-db";
import {
  SPEC_DB_SCHEMA_VERSION,
  SPEC_MIGRATIONS,
  specTableNames,
  type SpecDbTables,
} from "./migrations/version-1.js";
import { SpecRepo } from "./repositories/spec-repo.js";
import { TransitionsRepo } from "./repositories/transitions-repo.js";
import { DocsRepo } from "./repositories/docs-repo.js";

export { SPEC_DB_SCHEMA_VERSION, SPEC_MIGRATIONS, specTableNames, type SpecDbTables };

export interface SpecDbOpts {
  /** 库文件覆盖（':memory:' 供域逻辑测试；缺省 = {home}/forge/db/spec/spec.db） */
  file?: string
}

export interface SpecDomainDb {
  db: Database.Database;
  tables: SpecDbTables;
  repos: {
    specs: SpecRepo;
    transitions: TransitionsRepo;
    docs: DocsRepo;
  };
}

/** spec.db 落点：{DSH_HOME}/forge/db/spec/spec.db（单装）。 */
export function specDbFileName(home: string): string {
  return join(home, "forge", "db", "spec", "spec.db");
}

/**
 * 打开（或创建）spec.db 并装配三 repositories（行级读写门）。
 * busy_timeout 预设随连接设置（WAL 活写兼容 app 在场）；foreign_keys 逐连接由 lib/db
 * openDatabase 设置并断言回读（I4——不达即抛错拒开）。
 */
export function openSpecDb(home: string, opts: SpecDbOpts = {}): SpecDomainDb {
  const file = opts.file ?? specDbFileName(home);
  const db = openDatabase(file, {
    migrations: SPEC_MIGRATIONS,
    schemaVersion: SPEC_DB_SCHEMA_VERSION,
  })
  db.pragma("busy_timeout = 5000")
  const tables = specTableNames()
  return {
    db,
    tables,
    repos: {
      specs: new SpecRepo(db, tables),
      transitions: new TransitionsRepo(db, tables),
      docs: new DocsRepo(db, tables),
    },
  }
}
