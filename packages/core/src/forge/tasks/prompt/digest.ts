// dispatchPrompt 指纹（任务 2.2；tech-design §Interface 9「digest = sha-256(全文,含人格段
// 与标签)前 12 hex」）。Hard Rule（§6-11 沿袭）：dispatchPrompt 全文不入库——task_records
// 仅存本 digest（幂等重入「简报重合成 digest 新值」的判据）。定位铁律：纯函数禁 IO。
import { createHash } from 'node:crypto'

/** digest 长度（前 N hex——契约常量，labels/dto 注释同口径） */
export const DISPATCH_DIGEST_LENGTH = 12

/**
 * 派发简报指纹：sha-256(全文) 前 12 hex（小写）。
 * 全文 = 组成序四段拼接体（人格段无标签 + 三标签块）——改任何一段（含人格段与标签本身）
 * 均产生新值；调用方 = claimTask（2.4，claim record 落 dispatch_digest 列）。
 */
export function dispatchDigest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, DISPATCH_DIGEST_LENGTH)
}
