// core db/ 兼容面（plugin-project 1.7 归并锚）：本体 git mv 迁入 @dsh-forge/lib-db，
// 本文件 re-export 保持 core 内部 '../../db/transaction.js' 既有 import 面零改动；退役收口另有任务。
export { withTransaction } from '@dsh-forge/lib-db'
