// dispatchPrompt 指纹（core forge/tasks/prompt/digest.ts 直迁——plugin-task-loop 1.7 内联，
// 逐字直迁）。Hard Rule：dispatchPrompt 全文不入库——task_records 仅存本 digest。
import { createHash } from "node:crypto";

/** digest 长度（前 N hex） */
export const DISPATCH_DIGEST_LENGTH = 12;

/** 派发简报指纹：sha-256(全文) 前 12 hex（小写） */
export function dispatchDigest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, DISPATCH_DIGEST_LENGTH);
}
