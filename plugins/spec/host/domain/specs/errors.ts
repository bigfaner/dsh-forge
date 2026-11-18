// 域错误单源（plugin-spec 1.3，code-design §1②）——typed Error 码制（ERR_SPEC_*），
// 禁 message 字符串判据；每守卫一类型。
export type SpecErrorCode =
  | "ERR_SPEC_GOALS_EMPTY"
  | "ERR_SPEC_CRITERION_EMPTY"
  | "ERR_SPEC_TIERS_INVALID"
  | "ERR_SPEC_DUPLICATE_SLUG"
  | "ERR_SPEC_DUPLICATE_DOC_PATH"
  | "ERR_SPEC_PROJECT_KEY_DERIVATION"
  | "ERR_SPEC_NOT_FOUND"
  | "ERR_SPEC_ARCHIVED_FROZEN"
  | "ERR_SPEC_ILLEGAL_TRANSITION"
  | "ERR_SPEC_REJECT_NOTE_REQUIRED"
  | "ERR_SPEC_ACTOR_INVALID"
  | "ERR_SPEC_DOC_WRITE"
  | "ERR_SPEC_GOAL_ILLEGAL_TRANSITION"
  | "ERR_SPEC_GOAL_REJECT_NOTE_REQUIRED"
  | "ERR_SPEC_GOAL_NOT_FOUND"
  | "ERR_SPEC_REVIEW_GAP_NOTE_REQUIRED"
  | "ERR_SPEC_REVIEW_GOAL_NOT_REVIEWING"
  | "ERR_SPEC_REVIEW_KIND_INVALID"
   | "ERR_SPEC_ROADMAP_UNKNOWN"
   | "ERR_SPEC_ROADMAP_TERMINAL"
   | "ERR_SPEC_MILESTONE_UNKNOWN"
   | "ERR_SPEC_MILESTONE_PROJECT_MISMATCH"
   | "ERR_SPEC_MOVE_ANCHOR_INVALID"
   | "ERR_SPEC_AC_INVALID"
   | "ERR_SPEC_AC_ADDRESS_UNKNOWN"
   | "ERR_SPEC_CONFIRM_NOT_ACHIEVED";

export interface SpecErrorData {
  readonly code: SpecErrorCode;
  readonly data?: Record<string, unknown>;
}

/** spec 域 typed Error（code = 唯一判据；message 仅人读）。 */
export class SpecError extends Error {
  readonly code: SpecErrorCode;
  readonly data: Record<string, unknown>;

  constructor(code: SpecErrorCode, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.name = "SpecError";
    this.code = code;
    this.data = data;
  }
}

export function isSpecError(e: unknown): e is SpecError {
  return e instanceof SpecError;
}
