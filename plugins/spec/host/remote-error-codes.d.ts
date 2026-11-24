// 官方 RemoteErrorDetailsMap 增量（host 半 typed 失败抛出——RemoteError code 保真类型化）：
// 本插件 Remote/域失败码族进官方码表（gateway rpcFailure 对 RemoteError 保真折叠 code 过 wire，
// client failure 分支承接）。export {} 使本文件为 module——declare module 即 augmentation
// （并入官方类型面，非整面覆写）。
export {};

declare module "@deepseek-ai/dsh-typert-protocol" {
  export interface RemoteErrorDetailsMap {
    "ERR_SPEC_UNAVAILABLE": object;
    "ERR_SPEC_IDENTITY_UNRESOLVED": object;
    "ERR_SPEC_REMOTE_FAILED": object;
    "ERR_SPEC_REMOTE_INVALID_INPUT": object;
    "ERR_SPEC_GOALS_EMPTY": object;
    "ERR_SPEC_CRITERION_EMPTY": object;
    "ERR_SPEC_TIERS_INVALID": object;
    "ERR_SPEC_DUPLICATE_SLUG": object;
    "ERR_SPEC_DUPLICATE_DOC_PATH": object;
    "ERR_SPEC_PROJECT_KEY_DERIVATION": object;
    "ERR_SPEC_NOT_FOUND": object;
    "ERR_SPEC_ARCHIVED_FROZEN": object;
    "ERR_SPEC_ILLEGAL_TRANSITION": object;
    "ERR_SPEC_REJECT_NOTE_REQUIRED": object;
    "ERR_SPEC_ACTOR_INVALID": object;
    "ERR_SPEC_DOC_WRITE": object;
    "ERR_SPEC_GOAL_ILLEGAL_TRANSITION": object;
    "ERR_SPEC_GOAL_REJECT_NOTE_REQUIRED": object;
    "ERR_SPEC_GOAL_NOT_FOUND": object;
    "ERR_SPEC_REVIEW_GAP_NOTE_REQUIRED": object;
    "ERR_SPEC_REVIEW_GOAL_NOT_REVIEWING": object;
    "ERR_SPEC_REVIEW_KIND_INVALID": object;
    "ERR_SPEC_ROADMAP_UNKNOWN": object;
    "ERR_SPEC_ROADMAP_TERMINAL": object;
    "ERR_SPEC_MILESTONE_UNKNOWN": object;
    "ERR_SPEC_MILESTONE_PROJECT_MISMATCH": object;
    "ERR_SPEC_MOVE_ANCHOR_INVALID": object;
    "ERR_SPEC_AC_INVALID": object;
    "ERR_SPEC_AC_ADDRESS_UNKNOWN": object;
    "ERR_SPEC_CONFIRM_NOT_ACHIEVED": object;
    "ERR_SPEC_INCLUDE_UNKNOWN": object;
  }
}
