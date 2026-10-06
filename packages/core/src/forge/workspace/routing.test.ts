// 任务 2.7 测试 —— 中央 projects 行路由（projectId → ws_path / forge_dir）：生产装配
// （index.ts provide ×4）的 store.resolveDir 与 docs 守卫基准共用的共享基建面。
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { openDatabase } from '../../db/index.js'
import { seedProjectRow, SEED_TS } from '../../testutil/db-seeds.js'
import { createProjectRouting } from './routing.js'

let dir: string
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})
const dbFile = () => join((dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-route-'))), `${randomUUID()}.db`)

describe('CentralProjectRouting：中央行锚点解析', () => {
  it('wsPath / forgeDir 命中返回落库值（registry canonical 口径）', () => {
    const db = openDatabase(dbFile())
    seedProjectRow(db, { id: 'p1', workspaceId: 'w1', wsPath: 'Z:\\proj\\demo', forgeDir: 'Z:\\proj\\demo\\.forge' })
    const routing = createProjectRouting(db)
    expect(routing.wsPath('p1')).toBe('Z:\\proj\\demo')
    expect(routing.forgeDir('p1')).toBe('Z:\\proj\\demo\\.forge')
    db.close()
  })

  it('未命中 → fail-loud 普通 Error（非 typed 面——正常流不经此面）', () => {
    const db = openDatabase(dbFile())
    seedProjectRow(db, { id: 'p1', workspaceId: 'w1', wsPath: 'C:\\a', createdAt: SEED_TS })
    const routing = createProjectRouting(db)
    expect(() => routing.wsPath('ghost')).toThrowError(/ghost/)
    expect(() => routing.forgeDir('ghost')).toThrowError(/未命中中央 projects 行/)
    db.close()
  })
})
