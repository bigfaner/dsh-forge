// workbench/migration/backup — 迁移前备份与文档树恢复(任务 1.4,Interface 4 第 2 步)。
//
// 备份落位(Hard Rule:userData 默认权限路径,TECH-data-kernel-002 同根):
//   `<userData>/workbench/backups/<projectId>-<ts>/`
//     ├─ workbench.db[|-wal|-shm]   库文件快照(单写者内核,无并发写窗口,
//     │                              三件套一起拷贝即一致快照;库文件不含
//     │                              凭据 —— 本库只存工作台自有状态,T6)
//     └─ tasks/<featureSlug>/…      文档树 tasks/ 全量拷贝(index.json +
//                                任务 .md + records/;.md 只拷贝不改动)
//
// `<ts>` = ISO 串的 `:`/`.` 归一为 `-`(db.ts corrupt-backup 同款惯例,
// Windows 文件名安全);同刻目录已存在时追加 `-2`/`-3` 去重。
//
// 恢复(rollback 相的文档树半身):迁移过程对文档树的唯一改动 = index.json
// 改名归档;恢复优先改名回滚(零内容重写),失败才整体从备份拷回
// (preserveTimestamps 保 mtime —— md 纪律:tasks/*.md 与 records/*.md
// 全程不迁移不改动)。

import { existsSync, readdirSync } from 'node:fs'
import { mkdir, copyFile, cp, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

/** 备份产物(backup 相 migration_event.detail_json 的载荷形态)。 */
export interface MigrationBackupOutcome {
  /** 备份目录绝对路径(projects.backup_path 落库值)。 */
  readonly backupPath: string
  /** 已拷贝的库文件名(基名;含 -wal/-shm 伴生件)。 */
  readonly dbFiles: string[]
  /** 已拷贝 tasks/ 树的 feature slug 清单(字典序)。 */
  readonly taskDirs: string[]
}

/** 备份根目录(userData 下;与库文件同根的默认权限路径)。 */
export function migrationBackupsRoot(userDataPath: string): string {
  return join(userDataPath, 'workbench', 'backups')
}

/** 列出文档树下含 tasks/ 子目录的 feature slug(字典序;ingest/backup 共用口径)。 */
export function listFeatureSlugsWithTasks(featuresRoot: string): string[] {
  let dirents: ReadonlyArray<{ readonly name: string; readonly isDirectory: () => boolean }>
  try {
    dirents = readdirSync(featuresRoot, { withFileTypes: true })
  } catch {
    return [] // 文档根不可读:无 feature 可迁移(守卫后 ingest 会给出显式失败)
  }
  return dirents
    .filter(dirent => dirent.isDirectory() && existsSync(join(featuresRoot, dirent.name, 'tasks')))
    .map(dirent => dirent.name)
    .sort()
}

/** 时间戳 → 文件名安全段(db.ts corrupt-backup 同款归一)。 */
export function fileStampOf(date: Date): string {
  return date.toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

async function createMigrationBackup(input: {
  readonly userDataPath: string
  readonly projectId: string
  readonly dbPath: string
  readonly featuresRoot: string
  readonly stamp: string
}): Promise<MigrationBackupOutcome> {
  const base = join(migrationBackupsRoot(input.userDataPath), `${input.projectId}-${input.stamp}`)
  // 同刻重入(同测试内两次迁移等):追加序号去重,不覆盖既有备份。
  let backupPath = base
  for (let i = 2; existsSync(backupPath); i += 1) backupPath = `${base}-${String(i)}`
  await mkdir(backupPath, { recursive: true })

  // 库文件三件套:存在即拷(-wal/-shm 随行,WAL 未检查点内容不丢)。
  const dbFiles: string[] = []
  for (const name of [input.dbPath, `${input.dbPath}-wal`, `${input.dbPath}-shm`]) {
    if (!existsSync(name)) continue
    await copyFile(name, join(backupPath, basenameOf(name)))
    dbFiles.push(basenameOf(name))
  }

  // 文档树 tasks/ 拷贝:只读源(preserveTimestamps;mtime 是 updatedAt 派生时钟)。
  const taskDirs: string[] = []
  for (const slug of listFeatureSlugsWithTasks(input.featuresRoot)) {
    await cp(join(input.featuresRoot, slug, 'tasks'), join(backupPath, 'tasks', slug), {
      recursive: true,
      preserveTimestamps: true,
    })
    taskDirs.push(slug)
  }
  return { backupPath, dbFiles, taskDirs }
}

function basenameOf(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx === -1 ? path : path.slice(idx + 1)
}

/** 文档树下该 feature 的归档 index(index.json 缺失 + .migrated-<ts> 存在)。 */
async function archivedIndexIn(featuresRoot: string, slug: string): Promise<string | null> {
  const tasksDir = join(featuresRoot, slug, 'tasks')
  if (existsSync(join(tasksDir, 'index.json'))) return null
  let names: string[]
  try {
    names = readdirSync(tasksDir)
  } catch {
    return null
  }
  const archived = names.filter(name => /^index\.json\.migrated-/.test(name)).sort()
  return archived.length > 0 ? join(tasksDir, archived[archived.length - 1] as string) : null
}

/** 恢复产物(rollback 相 detail 的文档树半身)。 */
export interface DocTreeRestoreOutcome {
  /** 改名回滚成功的 feature slug(index.json.migrated-<ts> → index.json)。 */
  readonly renamedBack: string[]
  /** 从备份整体拷回的 feature slug(改名回滚不可行时的兜底)。 */
  readonly restoredFromBackup: string[]
}

/**
 * 迁移失败后的文档树恢复:优先把已归档的 index.json 改名回原位(内容零
 * 重写、其余文件零触碰);改名不可行(文件系统拒绝/归档件丢失)且备份
 * 在 → 整树拷回。正常失败路径(摄入/对拍)文档树本就未动 → no-op。
 */
export async function restoreDocTreeAfterFailure(input: {
  readonly featuresRoot: string
  readonly backupPath: string | null
}): Promise<DocTreeRestoreOutcome> {
  const renamedBack: string[] = []
  const restoredFromBackup: string[] = []
  for (const slug of listFeatureSlugsWithTasks(input.featuresRoot)) {
    const archived = await archivedIndexIn(input.featuresRoot, slug)
    if (archived === null) continue
    if (existsSync(join(input.featuresRoot, slug, 'tasks', 'index.json'))) continue
    try {
      await rename(archived, join(input.featuresRoot, slug, 'tasks', 'index.json'))
      renamedBack.push(slug)
      continue
    } catch {
      // 改名回滚失败 → 落入备份兜底
    }
    if (input.backupPath !== null && existsSync(join(input.backupPath, 'tasks', slug, 'index.json'))) {
      await rm(join(input.featuresRoot, slug, 'tasks'), { recursive: true, force: true })
      await cp(join(input.backupPath, 'tasks', slug), join(input.featuresRoot, slug, 'tasks'), {
        recursive: true,
        preserveTimestamps: true,
      })
      restoredFromBackup.push(slug)
    }
  }
  return { renamedBack, restoredFromBackup }
}

export { createMigrationBackup }
