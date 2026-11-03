// A2 自启入口单测：锚在场自启（库 + 注册表可用 + close 幂等安全）；锚缺席/开库失败
// fail-soft 返回 undefined（双态——不阻载插件）；config.dbFile 显式即自启。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startSelfHostedStorage } from './start.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'knowledge-start-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

describe('startSelfHostedStorage（自启判定 + fail-soft）', () => {
  it('config.dbFile 在场 → 自启成功：库可写注册行、close 后句柄闭合', () => {
    const file = join(tmpRoot(), 'knowledge.db')
    const storage = startSelfHostedStorage({ dbFile: file }, {})
    expect(storage).toBeDefined()
    const s = storage!
    try {
      const row = s.registry.upsert(join(tmpRoot(), 'ws'), join(tmpRoot(), 'ws', '.knowledge'))
      expect(s.registry.findByWsPath(row.wsPath)).toBeDefined()
    } finally {
      s.close()
    }
    expect(s.db.open).toBe(false)
  })

  it('宿主锚在场（DSH_HOME）→ 缺省路径自启（宿主数据域子目录）', () => {
    const home = tmpRoot()
    const storage = startSelfHostedStorage({}, { DSH_HOME: home })
    expect(storage).toBeDefined()
    storage!.close()
  })

  it('双锚缺席且无 config.dbFile → undefined（不自启，不向 ~/.dsh 落盘）', () => {
    expect(startSelfHostedStorage({}, {})).toBeUndefined()
  })

  it('开库失败 fail-soft → undefined（目录指向文件等不可建库形态不抛出）', () => {
    const root = tmpRoot()
    const blocker = join(root, 'blocker')
    writeFileSync(blocker, 'not a dir')
    expect(startSelfHostedStorage({ dbFile: join(blocker, 'knowledge.db') }, {})).toBeUndefined()
  })
})
