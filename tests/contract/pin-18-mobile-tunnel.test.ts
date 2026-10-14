// G1 pin（dsh-mobile-tunnel 1.5）：隧道模块结构面 + 配对扩展路由面 + UI tab 启用面。
// 权威：proposal dsh-mobile-tunnel（1.2 隧道层注入抽象 / 1.3 PIN + /pair/verify /
// PAIRING_FACES 单源 / 1.4 互联网 tab 真实启用）。
// 审计面（机械断言）：
//   1. tunnel/ 模块在场；外部交互（fetch/spawn）零散逸——全经 TunnelDeps 注入缝；
//   2. /pair/verify 路由注册在场 + 限速常量单源（pairing.ts 唯一定义，child.ts 零复制）；
//   3. 互联网 tab 非 disabled 占位（testid 在场 + onSelect 缝）；
//   4. 隧道相关测试零 skip/todo/only。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PAIRING_FACES,
  PAIRING_TTL_MS,
  PIN_LENGTH,
  PIN_LOCKOUT_MS,
  PIN_MAX_FAILURES,
  PIN_RATE_WINDOW_MS,
  PIN_TTL_MS,
} from '../../apps/host/src/boot/pairing.js'
import { ROOT } from './pins.js'

const hostSrc = (rel: string): string => readFileSync(join(ROOT, 'apps/host/src', rel), 'utf8')
const webSrc = (rel: string): string => readFileSync(join(ROOT, 'apps/web/src', rel), 'utf8')
const tunnelFiles = ['tunnel/index.ts', 'tunnel/cloudflared.ts', 'tunnel/pinggy.ts'] as const
const tunnelTestFiles = [
  'apps/host/src/tunnel/tunnel.test.ts',
  'apps/host/src/boot/pairing.test.ts',
  'apps/web/src/views/remote/ForgeRemoteEntry.test.tsx',
] as const

describe('pin 18-1 tunnel/ 模块结构面（注入抽象——外部依赖零散逸）', () => {
  it('tunnel/ 三源文件在场（index 编排 + cloudflared 首选 + pinggy 兜底）', () => {
    for (const rel of tunnelFiles) {
      expect(() => hostSrc(rel), `apps/host/src/${rel} 缺席`).not.toThrow()
    }
  })

  it('TunnelDeps 注入缝声明在场：fetch/spawn 均为缝成员（cloudflared.ts 单源定义）', () => {
    const src = hostSrc('tunnel/cloudflared.ts')
    expect(src).toContain('export interface TunnelDeps')
    expect(src).toMatch(/fetch:\s*BinaryFetcher/)
    expect(src).toMatch(/spawn:\s*ProcessSpawner/)
  })

  it('tunnel 源面零直接 fetch(/spawn( 调用——全部经 deps. 前缀（散逸即红）', () => {
    for (const rel of tunnelFiles) {
      const src = hostSrc(rel)
      const bare = [...src.matchAll(/(?<!deps\.)(?<!\.)\b(fetch|spawn)\s*\(/g)].map((m) => m[0])
      expect(bare, `${rel} 存在非注入直接调用：${bare.join(', ')}`).toEqual([])
    }
  })

  it('tunnel 源面零 node 外部模块直引（child_process/fs/http 全不入隧道层）', () => {
    for (const rel of tunnelFiles) {
      const src = hostSrc(rel)
      expect(src, `${rel} 直引 node:child_process`).not.toMatch(/from 'node:child_process'/)
      expect(src, `${rel} 直引 node:http(s)`).not.toMatch(/from 'node:https?'/)
      expect(src, `${rel} 直引 node:fs`).not.toMatch(/from 'node:fs'/)
    }
  })

  it('child.ts 隧道装配经 TunnelManager + createNodeTunnelDeps（真实实现只在装配面）', () => {
    const src = hostSrc('boot/child.ts')
    expect(src).toContain("from '../tunnel/index.js'")
    expect(src).toMatch(/new TunnelManager\(\s*createNodeTunnelDeps\(\)/)
  })
})

describe('pin 18-2 /pair/verify 路由 + 限速常量单源', () => {
  it('PAIRING_FACES = 隧道反代目标只含配对面（单源常量值精确）', () => {
    expect(PAIRING_FACES).toEqual(['/pair', '/pair/verify'])
  })

  it('PIN 限速常量语义在场（6 位 · TTL 5min · 5 次失败/60s 窗 · 锁 5min）', () => {
    expect(PIN_LENGTH).toBe(6)
    expect(PIN_TTL_MS).toBe(PAIRING_TTL_MS)
    expect(PIN_MAX_FAILURES).toBe(5)
    expect(PIN_RATE_WINDOW_MS).toBe(60 * 1000)
    expect(PIN_LOCKOUT_MS).toBe(5 * 60 * 1000)
  })

  it('限速常量零二处定义（PIN_MAX/RATE/LOCKOUT 的 `=` 赋值只出现在 pairing.ts）', () => {
    const other = hostSrc('boot/child.ts') + webSrc('views/remote/ForgeRemoteEntry.tsx')
    for (const name of ['PIN_MAX_FAILURES', 'PIN_RATE_WINDOW_MS', 'PIN_LOCKOUT_MS', 'PIN_TTL_MS']) {
      expect(other, `${name} 在 pairing.ts 外重复定义`).not.toMatch(
        new RegExp(`(const|let|var)\\s+${name}\\s*=`),
      )
    }
  })

  it('child.ts 注册 /pair/verify 路由（exact + path 字面量仅此一处注册）且限速状态机零复制', () => {
    const src = hostSrc('boot/child.ts')
    expect(src).toMatch(/kind:\s*'exact',\s*\n\s*path:\s*'\/pair\/verify',/)
    expect(src.match(/path:\s*'\/pair\/verify'/g)).toHaveLength(1)
    expect(src).toMatch(/const pinIssuer = createPinIssuer\(\)/)
    expect(src).toMatch(/pinIssuer\.verify\(pin\)/)
    expect(src, '限速状态机不得在装配面复制（failures/lockUntil 私有于 pinIssuer）').not.toMatch(
      /\blockUntil\b|\bfailures\b/,
    )
  })
})

describe('pin 18-3 互联网 tab 非 disabled 占位（testid 在场 + 受控缝）', () => {
  it('tab-internet testid 在场且带 onSelect 缝（1.4 真实启用——非静态占位）', () => {
    const src = webSrc('views/remote/ForgeRemoteEntry.tsx')
    expect(src).toContain('data-testid="dswf-remote-tab-internet"')
    expect(src).toMatch(/data-testid="dswf-remote-tab-internet"[\s\S]{0,400}?onSelect\('internet'\)/)
    expect(src).toContain("onSelect('lan')")
  })

  it('双 tab 按钮块零 disabled 属性（fix-7 disabled 占位不得回潮）', () => {
    const src = webSrc('views/remote/ForgeRemoteEntry.tsx')
    const tabs = src.match(/<div className="dswf-remote-tabs"[\s\S]*?<\/div>\s*\n\s*\)/)
    expect(tabs, 'dswf-remote-tabs 块未找到').toBeTruthy()
    expect(tabs?.[0] ?? '').not.toContain('disabled')
  })
})

describe('pin 18-4 隧道相关测试零 skip/todo/only', () => {
  it('tunnel/pairing/UI 三测试文件无 .skip/.todo/.only 用例', () => {
    for (const rel of tunnelTestFiles) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src, `${rel} 含 skip/todo/only 用例`).not.toMatch(
        /\b(it|describe|test)\.(skip|todo|only|fails)\b/,
      )
    }
  })
})
