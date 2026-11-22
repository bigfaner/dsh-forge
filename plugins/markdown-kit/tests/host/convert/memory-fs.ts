// 内存 fs 缝替身（ConvertFsSeam 消费形——拒绝先于 IO 断言的 fs 侧对账计数器）
import type { ConvertFsSeam } from '../../../host/convert/index.js'

export interface MemoryFs {
  readonly fs: ConvertFsSeam
  readonly files: Map<string, Buffer>
  readonly writtenPaths: string[]
  readonly mkdirPaths: string[]
}

export function createMemoryFs(initial: Record<string, Buffer> = {}): MemoryFs {
  const files = new Map<string, Buffer>(Object.entries(initial))
  const writtenPaths: string[] = []
  const mkdirPaths: string[] = []
  return {
    files,
    writtenPaths,
    mkdirPaths,
    fs: {
      readFile: (p) => {
        const data = files.get(p)
        if (data === undefined) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' })
        return data
      },
      writeFile: (p, data) => {
        files.set(p, Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'))
        writtenPaths.push(p)
      },
      mkdir: (p) => {
        mkdirPaths.push(p)
      },
    },
  }
}
