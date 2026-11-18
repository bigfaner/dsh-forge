// spec.db 域装配（plugin-spec 1.3，code-design §4）——基于 lib/db openDatabase
// （WAL / busy_timeout / foreign_keys 三参数逐连接，I4 断言不达即 fail-closed 拒开）；
// 单装落点 {DSH_HOME}/forge/db/spec/spec.db；归属键谓词 DAO 单点注入
//（三 repo 在此装配，调用方零裸 SQL）。
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDatabase } from "@dsh-forge/lib-db";
import {
  SPEC_DB_SCHEMA_DOMAIN,
  SPEC_DB_SCHEMA_VERSION,
  SPEC_MIGRATIONS,
  specTableNames,
  type SpecDbTables,
} from "./migrations/version-1.js";
import { SPEC_MIGRATIONS_V2 } from "./migrations/version-2.js";
import { SpecRepo } from "./repositories/spec-repo.js";
import { TransitionsRepo } from "./repositories/transitions-repo.js";
import { DocsRepo } from "./repositories/docs-repo.js";
import { RoadmapRepo } from "./repositories/roadmap-repo.js";
import { MilestoneRepo } from "./repositories/milestone-repo.js";
import { ReviewsRepo } from "./repositories/reviews-repo.js";

export { SPEC_DB_SCHEMA_DOMAIN, SPEC_DB_SCHEMA_VERSION, SPEC_MIGRATIONS, SPEC_MIGRATIONS_V2, specTableNames, type SpecDbTables };

/** 完整迁移序列（v1 新线 + v2 重建——openDatabase 参数化传入，禁硬编码 import 中央序列）。 */
export const SPEC_MIGRATION_CHAIN = [...SPEC_MIGRATIONS, ...SPEC_MIGRATIONS_V2];

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
    roadmaps: RoadmapRepo;
    milestones: MilestoneRepo;
    reviews: ReviewsRepo;
  };
}

/** spec.db 落点：{DSH_HOME}/forge/db/spec/spec.db（单装）。 */
export function specDbFileName(home: string): string {
  return join(home, "forge", "db", "spec", "spec.db");
}

/**
 * 打开（或创建）spec.db 并装配三 repositories（行级读写门）。
 * WAL / busy_timeout / foreign_keys 三参数由 lib/db openDatabase 随连接设置并断言回读
 * （I4——不达即抛错拒开；busy_timeout 重设已收敛归 openDatabase 承担，F5 配方归口）。
 */
export function openSpecDb(home: string, opts: SpecDbOpts = {}): SpecDomainDb {
  const file = opts.file ?? specDbFileName(home);
  const db = openDatabase(file, {
    migrations: SPEC_MIGRATION_CHAIN,
    schemaVersion: SPEC_DB_SCHEMA_VERSION,
    // 分域版本线锚（R3-dba）：版本门只判读 spec 域版本线——共库形态下 knowledge/task-loop
    // 先行迁移抬升的异域版本行不触发拒开（bug 34645ce2 处方；单装形态语义不变）。
    domain: SPEC_DB_SCHEMA_DOMAIN,
  })
  const tables = specTableNames()
  return {
    db,
    tables,
    repos: {
      specs: new SpecRepo(db, tables),
      transitions: new TransitionsRepo(db, tables),
      docs: new DocsRepo(db, tables),
      roadmaps: new RoadmapRepo(db, tables),
      milestones: new MilestoneRepo(db, tables),
      reviews: new ReviewsRepo(db, tables),
    },
  }
}
