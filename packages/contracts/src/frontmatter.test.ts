// 1.3 AC2 —— frontmatter 最小契约常量 pin（tech-design §frontmatter 最小契约）。
// 执行（解析校验/缺省/容错）归 core 知识域解析器（3.1 消费本常量，不重复定义）。
import { describe, expect, it } from 'vitest'
import {
  FRONTMATTER_DOMAIN_MAX_DEPTH,
  FRONTMATTER_KEYS,
  FRONTMATTER_OPTIONAL_KEYS,
  FRONTMATTER_REQUIRED_KEYS,
  FRONTMATTER_STATUS_DEFAULT,
} from './frontmatter.js'

describe('AC2 frontmatter 契约常量', () => {
  it('必填字段 = summary / keywords（缺失不入索引，rebuild 报告计数）', () => {
    expect([...FRONTMATTER_REQUIRED_KEYS]).toEqual(['summary', 'keywords'])
  })

  it('可选字段 = title / status / id / authors / updated（表 ✗ 行）', () => {
    expect([...FRONTMATTER_OPTIONAL_KEYS]).toEqual(['title', 'status', 'id', 'authors', 'updated'])
  })

  it('必填 ∪ 可选 = 字段全集，且两集无交（划分完备）', () => {
    expect([...FRONTMATTER_KEYS].sort()).toEqual(
      [...FRONTMATTER_REQUIRED_KEYS, ...FRONTMATTER_OPTIONAL_KEYS].sort(),
    )
    for (const key of FRONTMATTER_REQUIRED_KEYS) {
      expect(FRONTMATTER_OPTIONAL_KEYS).not.toContain(key)
    }
  })

  it('status 默认 draft（P1 仅承载，审核流 M4）', () => {
    expect(FRONTMATTER_STATUS_DEFAULT).toBe('draft')
  })

  it('域 = 目录路径派生，层级上限 3（超层不入索引，标 invalid）', () => {
    expect(FRONTMATTER_DOMAIN_MAX_DEPTH).toBe(3)
  })
})
