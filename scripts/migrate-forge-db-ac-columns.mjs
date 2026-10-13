// forge.db 存量库列补齐迁移脚本（v1 直改跨轮次——早期形态库缺 ac_json 等后加列）。
//
// 用途：修复「任务详情装载失败：no such column: ac_json」——FORGE_DB_SCHEMA_VERSION 恒为 1
// （无迁移路径裁决），早期直改形态的存量 forge.db 版本门/表门放行但缺后加列，查询炸裸
// SQLite 错。本脚本对每个 forge.db：备份 → pragma 探测缺列 → ALTER TABLE ADD COLUMN 补齐
// → 复验。幂等：列已在场即跳过，可重复执行。
//
// 用法（仓库根目录）：
//   node scripts/migrate-forge-db-ac-columns.mjs            # 默认 tasksHome
//   DSH_FORGE_TASKS_HOME=X:/dir node scripts/...            # 显式 tasksHome
// 注意：执行前请先退出 dsh-forge 应用（库文件被占用时 better-sqlite3 打开即失败）。
import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import Database from 'better-sqlite3'

// v1 终态列清单（蓝本 packages/core/src/forge/workspace/migrations.ts——只列补齐面，
// 建库径不在本脚本职责内：库文件缺席直接跳过，交给应用惰性新建 v1）
const EXPECTED_COLUMNS = {
  tasks: {
    ac_json: 'TEXT', // AC gate 数据面（M3 1.2）
    mode: "TEXT CHECK (mode IN ('expedition', 'blitz') OR mode IS NULL)", // mode 快照
    source_kind: "TEXT NOT NULL DEFAULT 'feature' CHECK (source_kind IN ('feature', 'proposal'))", // 源头双列
    source_id: 'TEXT NOT NULL DEFAULT \'\'',
  },
  task_records: {
    ac_json: 'TEXT', // AC 逐项核验结果（S3 worker-lean-execution）
    record_fields_json: 'TEXT', // 结构化字段（keyDecisions/testsPassed/...）
    loop_sourced: 'INTEGER NOT NULL DEFAULT 0 CHECK (loop_sourced IN (0, 1))', // 循环来源标记
  },
  proposals: {
    mode: "TEXT CHECK (mode IN ('expedition', 'blitz') OR mode IS NULL)",
    superseded_by: 'TEXT REFERENCES proposals(id)',
  },
}

const tasksHome =
  process.env.DSH_FORGE_TASKS_HOME ?? join(homedir(), 'AppData', 'Roaming', 'dsh-forge', 'forge-workspaces')

if (!existsSync(tasksHome)) {
  console.error(`tasksHome 不存在：${tasksHome}`)
  process.exit(1)
}

let changed = 0
let skipped = 0
for (const entry of readdirSync(tasksHome, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const file = join(tasksHome, entry.name, 'forge.db')
  if (!existsSync(file)) continue

  let db
  try {
    db = new Database(file) // 被占用（应用未退出）→ 这里抛错
  } catch (cause) {
    console.warn(`跳过（库被占用或无法打开，请先退出 dsh-forge 应用）：${file}——${cause.message}`)
    continue
  }

  try {
    const plan = []
    for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
      const hasTable =
        db.prepare(`SELECT count(*) AS c FROM sqlite_master WHERE type='table' AND name = ?`).get(table).c > 0
      if (!hasTable) continue // 缺整表（如 feature_records 旧形态）不在补列范围——交废弃重扫
      const present = new Set(db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table).map((r) => r.name))
      for (const [col, ddl] of Object.entries(columns)) {
        if (!present.has(col)) plan.push([table, col, ddl])
      }
    }

    if (plan.length === 0) {
      skipped++
      console.log(`OK（无需迁移）：${file}`)
      continue
    }

    copyFileSync(file, `${file}.bak-pre-ac-migration`) // 迁移前备份
    const apply = db.transaction(() => {
      for (const [table, col, ddl] of plan) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`)
      }
    })
    apply()

    // 复验：全部期望列在场
    for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
      const present = new Set(db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table).map((r) => r.name))
      const missing = Object.keys(columns).filter((c) => !present.has(c))
      if (missing.length > 0) throw new Error(`${table} 复验缺列：${missing.join(', ')}`)
    }
    changed++
    console.log(`已迁移（补 ${plan.length} 列，备份 ${file}.bak-pre-ac-migration）：${file}`)
    console.log(`  → ${plan.map(([t, c]) => `${t}.${c}`).join(', ')}`)
  } catch (cause) {
    console.error(`迁移失败（库未变更或已回滚）：${file}——${cause.message}`)
    process.exitCode = 1
  } finally {
    db.close()
  }
}

console.log(`\n完成：迁移 ${changed} 库，无缺列 ${skipped} 库（tasksHome=${tasksHome}）`)
