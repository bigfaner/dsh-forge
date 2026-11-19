// core db/ 兼容面（plugin-project 1.7 归并锚）：schema 迁移本体 git mv 迁入 @dsh-forge/lib-db，
// 本文件 re-export 保持 core 内部 '../../db/schema.js' 既有 import 面零改动；退役收口另有任务。
export {
  MIGRATIONS,
  SCHEMA_VERSION,
  WORKTREE_DIR_BACKFILL_SQL,
  type Migration,
  type MigrationStatement,
} from '@dsh-forge/lib-db/schema'
