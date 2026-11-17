// host/db/connection.ts——project.db 域装配（plugin-project 1.9，code-design §1）：
// 基于 lib/db openDatabase（WAL / busy_timeout / foreign_keys 三参数逐连接，I4 断言不达即抛错拒开）；
// 前缀参数化（恒 'project'——单装同前缀，DDL/快照测试单套消灭两形态分叉）+
// 归属键谓词 DAO 单点注入（三 repositories 在此装配，调用方零裸 SQL）。
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openDatabase } from '@dsh-forge/lib-db'
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
 * busy_timeout 预设随连接设置（WAL 活写兼容 app 在场）；foreign_keys 逐连接由 lib/db
 * openDatabase 设置并断言回读（I4——不达即抛错拒开，CASCADE 不允许静默失效）。
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
  db.pragma('busy_timeout = 5000')
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
