// G1 契约面清单第 1 项 pin：boot manifest 注入格式 {url, injections}。
import { describe, expect, it } from 'vitest'
import { buildBootManifest, lanIpv4Of } from './manifest.js'

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

  it('fix-3：remoteHost 在场透传（绑定 host 判读单源）；缺席/空串 = 字段不出现', () => {
    expect(buildBootManifest('http://127.0.0.1:1/', [], '0.0.0.0').remoteHost).toBe('0.0.0.0')
    expect('remoteHost' in buildBootManifest('http://127.0.0.1:1/', [])).toBe(false)
    expect('remoteHost' in buildBootManifest('http://127.0.0.1:1/', [], '')).toBe(false)
  })

  it('fix-5：remotePairUrl 在场透传（官方配对地址单源——QR/地址行不再自造）；缺席/空串 = 字段不出现', () => {
    expect(buildBootManifest('http://127.0.0.1:1/', [], '0.0.0.0', 'http://192.168.1.7:1/?token=t').remotePairUrl).toBe(
      'http://192.168.1.7:1/?token=t',
    )
    expect('remotePairUrl' in buildBootManifest('http://127.0.0.1:1/', [], '0.0.0.0')).toBe(false)
    expect('remotePairUrl' in buildBootManifest('http://127.0.0.1:1/', [], '0.0.0.0', '')).toBe(false)
  })

  it('fix-5：lanIpv4Of 网卡读数选址——首个非回环 IPv4（排除 link-local 169.254.*）；无 = undefined', () => {
    const nic = (address: string, family: unknown, internal: boolean) => ({ address, family, internal })
    expect(lanIpv4Of([[nic('192.168.1.7', 'IPv4', false)]])).toBe('192.168.1.7')
    expect(lanIpv4Of([[nic('127.0.0.1', 'IPv4', true)], [nic('10.0.0.2', 'IPv4', false)]])).toBe('10.0.0.2')
    expect(lanIpv4Of([[nic('169.254.9.9', 'IPv4', false)], [nic('192.168.0.3', 'IPv4', false)]])).toBe('192.168.0.3')
    expect(lanIpv4Of([[nic('fe80::1', 'IPv6', false)]])).toBeUndefined()
    expect(lanIpv4Of([])).toBeUndefined()
  })
})
