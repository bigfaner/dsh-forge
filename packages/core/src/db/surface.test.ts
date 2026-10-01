// 任务 2.1 测试 —— db/ 零域语义 pin（AC4）：导出面仅机制能力
// （句柄/迁移/事务/版本门），不出现 forge/知识业务概念。
// import 边界（db ↛ forge/knowledge）由 oxlint no-restricted-imports 机械执行（1.2 已建）。
import * as dbModule from './index.js'
import { describe, expect, it } from 'vitest'

describe('AC4 db/ 导出面零域语义', () => {
  it('导出键集 = 机制能力全集（无业务符号）', () => {
    expect(Object.keys(dbModule).sort()).toEqual([
      'MIGRATIONS',
      'SCHEMA_VERSION',
      'UnsupportedSchemaVersionError',
      'isUnsupportedSchemaVersionError',
      'openDatabase',
      'withTransaction',
    ])
  })

  it('SCHEMA_VERSION 为正整数（前向门上限）', () => {
    expect(dbModule.SCHEMA_VERSION).toBeGreaterThan(0)
    expect(Number.isInteger(dbModule.SCHEMA_VERSION)).toBe(true)
  })

  it('UnsupportedSchemaVersionError 是可识别的 typed error', () => {
    const err = new dbModule.UnsupportedSchemaVersionError(3, 1)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('UnsupportedSchemaVersionError')
    expect(dbModule.isUnsupportedSchemaVersionError(err)).toBe(true)
    expect(dbModule.isUnsupportedSchemaVersionError(new Error('x'))).toBe(false)
  })
})
