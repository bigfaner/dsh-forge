// JSON 原子写（定位：基础——同目录 tmp + rename，崩溃无半写文件）。
// lib 公共包归拢（plugin-project 1.2）：自 core forge/settings service 的 set() 原子写段
// 提取单源（排查命中：settings 原子写配方）——文件形状（2 空格缩进 + 尾换行）逐字承袭。
import { randomUUID } from 'node:crypto'
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * JSON 原子写：同目录 tmp + rename（Windows MoveFileEx REPLACE_EXISTING 语义——崩溃无半写）。
 * 内容 = `${JSON.stringify(value, null, 2)}\n`（settings 文件既有形状）。父目录不在场即递归建。
 * 任一步失败：最佳努力清理 tmp（清理失败不掩盖原始异常）后原样上抛，由调用方按各自 typed 面收口。
 */
export function atomicWriteJson(file: string, value: unknown): void {
  const tmp = `${file}.${randomUUID()}.tmp`
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    renameSync(tmp, file)
  } catch (cause) {
    try {
      unlinkSync(tmp)
    } catch {
      // 最佳努力清理失败不掩盖原始异常
    }
    throw cause
  }
}
