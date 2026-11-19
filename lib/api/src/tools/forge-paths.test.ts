// forge-paths Spec 文档路径派生常量单源单测（plugin-spec 1.4）——
// 派生公式 + slug 路径段守卫（反例必红）。
import { describe, expect, it } from 'vitest'
import { SPEC_DOC_FILE_NAME, SPEC_DOC_ROOT, specDocRelPath } from './forge-paths.js'

describe('specDocRelPath（Spec 文档路径单源派生）', () => {
  it('派生公式：.forge/specs/{slug}/spec.md', () => {
    expect(SPEC_DOC_ROOT).toBe('.forge/specs')
    expect(SPEC_DOC_FILE_NAME).toBe('spec.md')
    expect(specDocRelPath('demo-spec')).toBe('.forge/specs/demo-spec/spec.md')
  })

  it('slug 路径段守卫：空串/含分隔符/上跳段均拒绝', () => {
    expect(() => specDocRelPath('')).toThrow()
    expect(() => specDocRelPath('a/b')).toThrow()
    expect(() => specDocRelPath('a\\b')).toThrow()
    expect(() => specDocRelPath('..')).toThrow()
    expect(() => specDocRelPath('spec-v2')).not.toThrow()
  })
})
