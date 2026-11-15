// 包内两半共享契约常量（不出包——exports 基线双键按需扩键，shared 不对外）。
// 服务键沿用（圆桌 C1：键稳定性为登记制前提；域名对齐改名移 M5 组合器收口统一裁决）。
// 跨插件契约常量（与 spec 双包互检、experts 侧常量）后续落 @dsh-forge/contracts 单源
// （proposal §二 shared/ 去留判据——有外部消费者的载荷不入本目录）。

/** 任务域服务键（既有宿主服务键名沿用——登记制键稳定前提）。 */
export const FORGE_TASKS_SERVICE_KEY = "forgeTasks";

/** checkpoints 域服务键（既有宿主服务键名沿用）。 */
export const FORGE_CHECKPOINTS_SERVICE_KEY = "forgeCheckpoints";

/** 自持库缺省落点约定（单装形态缺省装配义务①：{DSH_HOME}/forge/db/task-loop/task-loop.db）。 */
export const TASK_LOOP_DB_DEFAULT_DIR = "forge/db/task-loop";
export const TASK_LOOP_DB_FILENAME = "task-loop.db";

/** 集成/单装两形态统一表名前缀（单套 DDL 消灭两形态分叉——db 级命名空间防撞）。 */
export const TASK_LOOP_TABLE_PREFIX = "task_";

/** fix density 口径 pin（entities.md §3.2④ 终态——公式漂移即契约快照 RED）。 */
export const FIX_DENSITY_FORMULA = "fix_root_chain_dedup × latest_success_commit_hash_dedup / settled_tasks";
