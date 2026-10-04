// 1.3 AC2 —— frontmatter 最小契约常量 pin（tech-design §frontmatter 最小契约）。
// 执行面消费 = STATUS_DEFAULT / DOMAIN_MAX_DEPTH（core 知识域解析器 3.1 消费，不重复定义）；
// fix-34：字段清单 FRONTMATTER_KEYS/REQUIRED/OPTIONAL parser 零引用已删——必填/可选口径由
// KnowledgeFrontmatter 形状承载（parser 手写校验），本文件只 pin 被消费的两常量。
import { describe, expect, it } from 'vitest'
import { FRONTMATTER_DOMAIN_MAX_DEPTH, FRONTMATTER_STATUS_DEFAULT } from './frontmatter.js'

describe('AC2 frontmatter 契约常量', () => {
  it('status 默认 draft（P1 仅承载，审核流 M4）', () => {
    expect(FRONTMATTER_STATUS_DEFAULT).toBe('draft')
  })

  it('域 = 目录路径派生，层级上限 3（超层不入索引，标 invalid）', () => {
    expect(FRONTMATTER_DOMAIN_MAX_DEPTH).toBe(3)
  })
})
