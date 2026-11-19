// host/db/connection.ts——project.db 域装配（plugin-project 1.9，code-design §1）：
// 基于 lib/db openDatabase（WAL / busy_timeout / foreign_keys 三参数逐连接，I4 断言不达即抛错拒开）；
// 前缀参数化（恒 'project'——单装同前缀，DDL/快照测试单套消灭两形态分叉）+
// 归属键谓词 DAO 单点注入（三 repositories 在此装配，调用方零裸 SQL）。
import { chmodSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openDatabase, openReadonlyDatabase } from '@dsh-forge/lib-db'
import { makeProjectMigrations, PROJECT_DB_SCHEMA_DOMAIN, PROJECT_DB_SCHEMA_VERSION, projectTableNames, type ProjectDbTables } from './migrations.js'
import { BugsRepo, ProjectsRepo, WorkspacesRepo } from './repositories/index.js'

/** 域前缀恒值（单装缺省；表名模板唯一消费此常量与调用方显式前缀）。 */
export const PROJECT_DB_PREFIX = 'project'

export interface DomainDbOpts {
  /** 域前缀（恒 'project'——异前缀仅供模板机制测试） */
  prefix: string
  /** 库文件覆盖（':memory:' 供域逻辑测试；缺省 = {home}/forge/db/project/project.db） */
  file?: string
}

export interface DomainDb {
  db: Database.Database
  tables: ProjectDbTables
  repos: {
    projects: ProjectsRepo
    workspaces: WorkspacesRepo
    bugs: BugsRepo
  }
}

/** project.db 落点：{DSH_HOME}/forge/db/project/project.db。 */
export function domainDbFileName(home: string): string {
  return join(home, 'forge', 'db', 'project', 'project.db')
}

/**
 * 打开（或创建）project.db 并装配三 repositories（行级读写门）。
 * WAL / busy_timeout / foreign_keys 三参数由 lib/db openDatabase 随连接设置并断言回读
 * （I4——不达即抛错拒开，CASCADE 不允许静默失效；busy_timeout 重设已收敛归
 * openDatabase 承担，F5 配方归口）。
 */
export function openDomainDb(home: string, opts: DomainDbOpts): DomainDb {
  const file = opts.file ?? domainDbFileName(home)
  const db = openDatabase(file, {
    migrations: makeProjectMigrations(opts.prefix),
    schemaVersion: PROJECT_DB_SCHEMA_VERSION,
    // 分域版本线锚（R3-dba）：版本门只判读 project 域版本线——共库形态下异域先行迁移
    // 抬升的版本行不触发拒开（bug ad14e904 共库接管前置；单装形态语义不变）。
    domain: PROJECT_DB_SCHEMA_DOMAIN,
  })
  const tables = projectTableNames(opts.prefix)
  return {
    db,
    tables,
    repos: {
      projects: new ProjectsRepo(db, tables),
      workspaces: new WorkspacesRepo(db, tables),
      bugs: new BugsRepo(db, tables),
    },
  }
}

/**
 * legacy 窗口库签名判定（bug 897ad81a）：库文件在座 + 本域表（`${prefix}_projects`）在座
 * + schema_meta 本域版本线判 0（无 domain 列的旧形状 / domain='' 旧世代行——指纹不可认领）
 * = 旧世代窗口库。现役库（本域版本行在座）恒 false——其开库失败（tampered/版本超前）属
 * 真异常，不得归档吞掉。
 */
export function isLegacyWindowDb(file: string): boolean {
  if (!existsSync(file)) return false
  let db: Database.Database
  try {
    db = openReadonlyDatabase(file)
  } catch {
    return false
  }
  try {
    const tables = new Set(
      db.prepare<unknown[], { name: string }>(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name),
    )
    if (!tables.has(`${PROJECT_DB_PREFIX}_projects`) || !tables.has('schema_meta')) return false
    const columns = (db.pragma(`table_info('schema_meta')`) as Array<{ name: string }>).map((c) => c.name)
    if (!columns.includes('domain')) return true
    const row = db
      .prepare<unknown[], { v: number | null }>(`SELECT MAX(version) AS v FROM schema_meta WHERE domain = ?`)
      .get(PROJECT_DB_SCHEMA_DOMAIN)
    return (row?.v ?? 0) === 0
  } catch {
    return false
  } finally {
    db.close()
  }
}

/**
 * legacy 窗口库只读归档（提案「迁移复制输出语义」——旧库不删不改）：主库 + WAL/SHM
 * 侧车改名 `.legacy-<ts>` 保留在原目录，主库 chmod 只读位。返回归档文件路径。
 */
export function archiveLegacyWindowDb(file: string): string {
  const archived = `${file}.legacy-${new Date().toISOString().replace(/[:.]/g, '-')}`
  renameSync(file, archived)
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${file}${suffix}`
    if (existsSync(sidecar)) renameSync(sidecar, `${archived}${suffix}`)
  }
  chmodSync(archived, 0o444)
  return archived
}
