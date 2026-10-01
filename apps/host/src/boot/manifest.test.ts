// G1 契约面清单第 1 项 pin：boot manifest 注入格式 {url, injections}。
import { describe, expect, it } from 'vitest'
import { buildBootManifest } from './manifest.js'

describe('buildBootManifest', () => {
  it('组装 {url, injections} 且冻结', () => {
    const injections = [{ kind: 'style', text: ':root{color-scheme:light}' }]
    const manifest = buildBootManifest('http://127.0.0.1:19400/#token', injections)
    expect(manifest.url).toBe('http://127.0.0.1:19400/#token')
    expect(manifest.injections).toEqual(injections)
    expect(Object.isFrozen(manifest)).toBe(true)
    expect(Object.isFrozen(manifest.injections)).toBe(true)
  })

  it('injections 拷贝隔离（外部数组后续变更不影响 manifest）', () => {
    const source: unknown[] = [{ kind: 'script', url: 'x.js' }]
    const manifest = buildBootManifest('http://127.0.0.1:1/', source)
    source.push({ kind: 'style' })
    expect(manifest.injections).toHaveLength(1)
  })

  it('url 非 http(s) 拒绝', () => {
    expect(() => buildBootManifest('file:///etc/passwd', [])).toThrow(/http\(s\) URL/)
    expect(() => buildBootManifest('', [])).toThrow(/http\(s\) URL/)
  })

  it('injections 非数组拒绝', () => {
    expect(() => buildBootManifest('http://127.0.0.1:1/', undefined as unknown as [])).toThrow(/数组/)
  })
})
