// 1.1 AC5 —— XML 标签集四枚封闭 pin（tech-design §Interface 9 标签总表；G1-14）。
// 标签集封闭于四枚——新增 = 契约面变更；每类型快照测试断言三标签在场 + 块序 + 人格段在场（core 侧）。
import { describe, expect, it } from 'vitest'
import { XML_TAGS, XML_TAG_SET } from './xml-tags.js'

describe('AC5 XML 标签集四枚封闭（Interface 9 总表）', () => {
  it('四成员逐字 pin（forge-pipeline / constraints / task-context / type-policy）', () => {
    expect(XML_TAGS).toEqual({
      forgePipeline: 'forge-pipeline',
      constraints: 'constraints',
      taskContext: 'task-context',
      typePolicy: 'type-policy',
    })
  })

  it('封闭面 = 四枚、无重复、无增员（新增即契约面变更）', () => {
    expect(XML_TAG_SET).toHaveLength(4)
    expect(new Set(XML_TAG_SET).size).toBe(4)
    expect([...XML_TAG_SET].sort()).toEqual([
      'constraints',
      'forge-pipeline',
      'task-context',
      'type-policy',
    ])
  })

  it('值为裸标签名（不含尖括号——包裹属 core prompt 合成逻辑，契约层零逻辑）', () => {
    for (const tag of XML_TAG_SET) {
      expect(tag).not.toContain('<')
      expect(tag).not.toContain('>')
      expect(tag).not.toContain('/')
    }
  })
})
