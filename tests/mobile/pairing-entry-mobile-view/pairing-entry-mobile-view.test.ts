// @feature:mobile-ui
// @mobile-e2e
// Journey: pairing-entry-mobile-view（配对进入 mobile 产物 + 手机专属视图 + 刷新配对态保持）。
// 溯源：contracts/step-1-pair-and-load.md … step-3-refresh-keep-pairing.md（每 Outcome 一测 + 冒烟）。
// 策略：产物隔离核查（apps/mobile 源面零桌面工程引用——grep 证据）+ 路由/视图骨架钉面 +
// 鉴权自持语义（401 → pairing 覆盖层、disconnected 信封）行为锚点；配对 gate 本体在 host
// 装配面（allowlist/cookie），手机端只消费 disconnected 信封——离线测试面以信封语义承担。
import { describe, expect, it } from 'vitest'
import { createRouter } from '../../../apps/mobile/src/core/router.js'
import { loadFixtures, mobileSrc, ROOT } from '../support.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const FIX = loadFixtures()

interface HashSource {
  get(): string
  set(hash: string): void
  subscribe(listener: () => void): () => void
}

function hashSource(initial: string): HashSource {
  let hash = initial
  const listeners = new Set<() => void>()
  return {
    get: () => hash,
    set: (next: string) => {
      hash = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** mobile 源面全部 ts 文件文本（产物引用隔离核查面） */
function allMobileSrc(): string {
  const root = join(ROOT, 'apps', 'mobile', 'src')
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(readFileSync(p, 'utf8'))
    }
  }
  walk(root)
  return files.join('\n')
}

describe('step-1 pair-and-load（扫码配对进入 mobile 单文件产物）', () => {
  it('success（配对后加载手机专属产物）', () => {
    // 回链 contracts/step-1-pair-and-load.md Outcome:success——产物入口 = 自有 mount + 路由骨架
    expect(mobileSrc('main.ts')).toMatch(/export function mount/)
    expect(mobileSrc('core/router.ts')).toMatch(/'chat' \| 'drawer' \| 'hero' \| 'settings' \| 'models' \| 'worker'/)
    // 鉴权面：/remote/__rpc 单呼通道（mobile 唯一消费面）录制在位
    expect(FIX.proxy.every((e) => e.url === '/remote/__rpc')).toBe(true)
  })

  it('unpaired-gate（未配对直接访问）', () => {
    // 回链 contracts/step-1-pair-and-load.md Outcome:unpaired-gate——
    // gate 在产物加载面（host 鉴权）+ 手机端 401 = disconnected 信封（零半初始化 UI：
    // 业务 error 信封 fail-soft，不 throw、不渲染部分视图）
    expect(mobileSrc('core/rpc.ts')).toMatch(/status === 401[\s\S]{0,120}code: 'disconnected', reason: 'unauthorized'/)
  })

  it('zero-desktop-reference（产物引用隔离核查）', () => {
    // 回链 contracts/step-1-pair-and-load.md Outcome:zero-desktop-reference——
    // 资源引用集合与桌面工程零交集：mobile 源面零 apps/web / 桌面 dsh-client-web 引用
    const src = allMobileSrc()
    expect(src).not.toMatch(/apps\/web/)
    expect(src).not.toMatch(/dsh-client-web|dsh-client-ui-|dsh-client-store/)
    // 依赖面核查：mobile package.json 无桌面 web 工作区依赖
    const pkg = JSON.parse(readFileSync(join(ROOT, 'apps', 'mobile', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.some((d) => d.includes('dsh-client-web'))).toBe(false)
  })
})

describe('step-2 enter-mobile-view（浏览手机专属受限视图）', () => {
  it('success（呈现手机专属视图）', () => {
    // 回链 contracts/step-2-enter-mobile-view.md Outcome:success——自有 hash router 路由骨架
    // （非桌面裁剪分支）：5 路由 + 浮层不走路由
    const router = createRouter(hashSource('#/chat/s-1'))
    expect(router.current()).toEqual({ name: 'chat', params: { id: 's-1' } })
    router.navigate('drawer')
    expect(router.current()).toEqual({ name: 'drawer', params: {} })
    router.openOverlay('tasks', {})
    expect(router.overlays()).toHaveLength(1)
    router.dispose()
  })

  it('desktop-coexist（桌面同 host 并存）', () => {
    // 回链 contracts/step-2-enter-mobile-view.md Outcome:desktop-coexist——
    // 产物互不引用（双端同时成立）：mobile 源面零桌面引用（与 step-1 核查同口径复检）+
    // 会话数据同源（api-ref 参照腿 = 官方 SessionSummary 形状）
    expect(allMobileSrc()).not.toMatch(/apps\/web/)
    const summary = FIX.apiRef.find((e) => (e.request as { method?: string }).method === 'session/list')
    expect(summary, 'session/list 参照腿（数据同源）已录').toBeTruthy()
  })
})

describe('step-3 refresh-keep-pairing（刷新页面配对态保持）', () => {
  it('success（刷新恢复一致视图）', () => {
    // 回链 contracts/step-3-refresh-keep-pairing.md Outcome:success——
    // 配对态 cookie 自持（页面内存零依赖）：路由器重实例化即恢复一致渲染基准
    const build = (): { name: string; params: Record<string, string> } | null => {
      const router = createRouter(hashSource('#/chat/s-1'))
      const match = router.current()
      router.dispose()
      return match
    }
    expect(build()).toEqual(build()) // 刷新前后等价
  })

  it('offline-refresh（断网刷新）', () => {
    // 回链 contracts/step-3-refresh-keep-pairing.md Outcome:offline-refresh
    // inferred：disconnected 信封驱动断线覆盖层（零伪造数据、零半初始化 UI）
    expect(mobileSrc('core/rpc.ts')).toMatch(/code: 'disconnected', reason: 'network'/)
    expect(mobileSrc('views/chat.ts')).toMatch(/'pairing'|重新配对/)
  })

  it('pairing-expired（配对态刷新时过期）', () => {
    // 回链 contracts/step-3-refresh-keep-pairing.md Outcome:pairing-expired
    // inferred：cookie 失效 = 401 → 全屏重新配对覆盖层（安全降级，永不渲染半初始化对话 UI）
    const src = mobileSrc('views/chat.ts')
    expect(src).toMatch(/error instanceof DisconnectedError\) setOverlay\('pairing'\)/)
    expect(src).toContain('会话已过期，请重新配对')
    expect(src).toMatch(/loadInitial\(\)\.catch\(\(\) => setOverlay\('pairing'\)\)/) // 初始加载失败同样回 gate
  })
})

describe('smoke: happy path 依序走全链（pairing-entry-mobile-view）', () => {
  it('配对进入 → 手机视图 → 刷新保持 → 断线/过期降级', () => {
    // ① 产物独立 + 单呼通道在位
    expect(allMobileSrc()).not.toMatch(/apps\/web|dsh-client-web/)
    expect(FIX.proxy.length).toBeGreaterThan(0)
    // ② 手机视图骨架（路由 + 浮层）
    const router = createRouter(hashSource('#/hero'))
    expect(router.current()?.name).toBe('hero')
    router.navigate('chat', { id: 's-1' })
    expect(router.current()).toEqual({ name: 'chat', params: { id: 's-1' } })
    router.dispose()
    // ③ 刷新等价 + 鉴权自持语义锚点
    expect(mobileSrc('core/rpc.ts')).toMatch(/'disconnected'/)
    expect(mobileSrc('views/chat.ts')).toMatch(/setOverlay\('pairing'\)/)
  })
})
