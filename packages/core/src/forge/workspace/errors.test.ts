// SuspectedMoveError typed 形状（plugin-project 1.6：自 derive-dir.test.ts 分离——errors 本体
// 在 core workspace/errors.ts；分类器本体已迁 lib/path，typed error 断言随本包留位）。
import { describe, expect, it } from 'vitest'
import { SuspectedMoveError } from './errors.js'

describe('SuspectedMoveError typed 形状（ERR_SUSPECTED_MOVE——409/UI 错误条+指引留场）', () => {
  it('code/data/name 齐备；message 含指引文案', () => {
    const data = {
      existingDir: 'Z:/forge-workspaces/ws@a1b2c3d4',
      derivedDir: 'Z:/forge-workspaces/ws@e5f6a7b8',
      guidance: '疑似移动：删孤儿目录或改回原名（认领对话框 = M3）',
    }
    const err = new SuspectedMoveError(data)
    expect(err.code).toBe('ERR_SUSPECTED_MOVE')
    expect(err.name).toBe('SuspectedMoveError')
    expect(err.data).toEqual(data)
    expect(err.message).toContain(data.guidance)
  })
})
