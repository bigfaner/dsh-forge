// 续跑指针读取（worker-exec-evidence-replay 1.3——Solution③ 重入证据指针透传的读侧）。
// claim 领取瞬间探测任务证据位根部的单点指针文件（logs/<slug>/<taskKey>/resume.md——
// 覆盖写、最新进度即真相，写入侧 = worker persona RESUME_POINTER_BLOCK 约定）；在盘 →
// logs/ 相对路径（正斜杠）注入 brief EVIDENCE 行，缺席 → undefined（首跑零行）。
// 路径形状与净化口径同 notify/incident-log（plugin-forge 侧；core 侧镜像同规则——
// 四域/包互禁 import，规则文本以本文件为 core 单源）。fail-soft：任何缺席/故障 = undefined。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { RESUME_POINTER_FILE } from './prompt/compose.js'

export { RESUME_POINTER_FILE }

/** 证据树路径段净化（同 incident-log sanitizeIncidentSegment 口径：[A-Za-z0-9._-] 之外折叠连字符） */
function sanitizeSegment(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * 探测续跑指针（领取瞬间取数）：容器库目录（deriveTaskStoreDir 单源派生值）+ slug +
 * localId → 指针文件在盘则返回 `logs/<slug>/<localId>/resume.md`（正斜杠相对路径），否则
 * undefined。容器目录缺席（undefined/空串）/路径故障 = undefined，绝不抛。
 */
export function readEvidencePointer(
  containerDir: string | undefined,
  slug: string,
  localId: string,
): string | undefined {
  if (containerDir === undefined || containerDir === '') return undefined
  const s = sanitizeSegment(slug)
  const k = sanitizeSegment(localId)
  if (s === '' || k === '') return undefined
  const rel = `logs/${s}/${k}/${RESUME_POINTER_FILE}`
  try {
    return existsSync(join(containerDir, ...rel.split('/'))) ? rel : undefined
  } catch {
    return undefined
  }
}
