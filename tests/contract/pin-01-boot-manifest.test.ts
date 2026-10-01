// G1 pin ①：boot manifest 注入格式（`{url, injections}` + `applyIndexInjections`）。
// 权威：tech-design Appendix 契约面清单第 1 项 + S1/S2 spike（spikes/s1-thin-host、
// s2-web-shell-inventory §1）。上游面（0.2.0-rc.2）：
//   - host 侧产出口：dsh-host-webserver `collectIndexInjections(): IndexInjection[]`
//     （一表双渲染：renderIndexInjections 服务端渲染 / applyIndexInjections 页侧解释器）
//   - renderer 侧消费口：dsh-client-web `applyIndexInjections(rows, loadScript)`
//   - 行形状 = IndexInjection 联合（6 kind）；行纯 JSON 可序列化（IPC `{url, injections}` 运输）
// 我方镜像：apps/host/src/boot/manifest.ts（host 组装）——池校验镜像形状兼容上游行。
import { afterEach, describe, expect, it } from 'vitest'
import { buildBootManifest } from '../../apps/host/src/boot/manifest.js'
import {
  expectPinnedVersion,
  importUpstream,
  readTypes,
} from './pins.js'

const INJECTION_KINDS = ['global', 'html', 'script', 'script-preload', 'script-src', 'style'] as const

describe('pin ①-1 版本锚（host 产出口 / renderer 消费口）', () => {
  it('dsh-host-webserver（host 锚）= 精确 pin 版本', () => {
    expectPinnedVersion('host', '@deepseek-ai/dsh-host-webserver')
  })
  it('dsh-client-web（web 锚）= 精确 pin 版本', () => {
    expectPinnedVersion('web', '@deepseek-ai/dsh-client-web')
  })
})

describe('pin ①-2 IndexInjection 行形状（联合类型 kind 全集，d.ts 公开面）', () => {
  const types = readTypes('host', '@deepseek-ai/dsh-host-webserver', 'lib/types/injections.d.ts')

  it('kind 全集 = 6 类（global/script/script-src/script-preload/style/html）', () => {
    const kinds = new Set([...types.matchAll(/kind: '([a-z-]+)'/g)].map((m) => m[1] as string))
    expect([...kinds].sort()).toEqual([...INJECTION_KINDS])
  })

  it('placement 取值 = head | body（渲染落点公开面）', () => {
    expect(types).toContain("export type IndexInjectionPlacement = 'head' | 'body'")
  })

  it("global 行 = {name, value}（JSON 值落 globalThis，先于后续 script 行——README 语义）", () => {
    expect(types).toContain("kind: 'global'")
    expect(types).toContain('Assign a JSON-serializable value to a `globalThis` property, ahead of later script rows')
  })

  it('script-src 行 = {placement, src}（表序执行的外部脚本——worker 形态经 loadScript await）', () => {
    expect(types).toContain('External classic script, executed in table order')
    expect(types).toContain('an awaited fetch-and-execute in the worker form')
  })
})

describe('pin ①-3 host 产出口签名（collectIndexInjections——{url, injections} 的 injections 源）', () => {
  const index = readTypes('host', '@deepseek-ai/dsh-host-webserver', 'lib/types/index.d.ts')

  it('collectIndexInjections(): IndexInjection[]（一表双渲染的收集口）', () => {
    expect(index).toContain('collectIndexInjections(): IndexInjection[]')
    expect(index).toContain("Gather the structured injection table: one `webserver/index-inject` emit")
  })

  it('renderIndexInjections(html, rows) 服务端渲染同表（served 形态）', () => {
    expect(index).toContain('export { renderIndexInjections }')
  })
})

describe('pin ①-4 applyIndexInjections 运行期契约（页侧解释器，Node 直载实测）', () => {
  it('导出为 async 函数、双参（rows, loadScript）——签名即 d.ts', async () => {
    const mod = await importUpstream('web', '@deepseek-ai/dsh-client-web/injections')
    const fn = mod['applyIndexInjections']
    expect(typeof fn).toBe('function')
    expect((fn as (...args: unknown[]) => unknown).length).toBe(2)
  })

  it('global 行把 JSON 值直落 globalThis[name]', async () => {
    const { applyIndexInjections } = (await importUpstream('web', '@deepseek-ai/dsh-client-web/injections')) as {
      applyIndexInjections: (rows: readonly unknown[], loadScript: (src: string) => Promise<void>) => Promise<void>
    }
    await applyIndexInjections(
      [{ kind: 'global', name: '__PIN_01_A__', value: { a: 1 } }, { kind: 'global', name: '__PIN_01_B__', value: null }],
      async () => {},
    )
    expect((globalThis as Record<string, unknown>)['__PIN_01_A__']).toEqual({ a: 1 })
    expect((globalThis as Record<string, unknown>)['__PIN_01_B__']).toBeNull()
  })

  it('script-src 行经 loadScript 执行且严格表序：先行的脚本加载中后续行未生效', async () => {
    const { applyIndexInjections } = (await importUpstream('web', '@deepseek-ai/dsh-client-web/injections')) as {
      applyIndexInjections: (rows: readonly unknown[], loadScript: (src: string) => Promise<void>) => Promise<void>
    }
    const loaded: string[] = []
    await applyIndexInjections(
      [
        { kind: 'script-src', placement: 'head', src: 'one.js' },
        { kind: 'global', name: '__PIN_01_ORDER__', value: 'late' },
        { kind: 'script-preload', src: 'pre.js' },
      ],
      async (src) => {
        loaded.push(src)
        // 表序契约：script-src 行 await 完成前，其后的 global 行不执行
        expect((globalThis as Record<string, unknown>)['__PIN_01_ORDER__']).toBeUndefined()
      },
    )
    expect(loaded).toEqual(['one.js']) // script-preload 行不触发加载器（advised only）
    expect((globalThis as Record<string, unknown>)['__PIN_01_ORDER__']).toBe('late')
  })

  it('未知 kind 行 fail-loud 抛错（unknown index injection row）', async () => {
    const { applyIndexInjections } = (await importUpstream('web', '@deepseek-ai/dsh-client-web/injections')) as {
      applyIndexInjections: (rows: readonly unknown[], loadScript: (src: string) => Promise<void>) => Promise<void>
    }
    await expect(applyIndexInjections([{ kind: 'bogus' }], async () => {})).rejects.toThrow(
      /unknown index injection row/,
    )
  })

  afterEach(() => {
    for (const key of ['__PIN_01_A__', '__PIN_01_B__', '__PIN_01_ORDER__']) {
      delete (globalThis as Record<string, unknown>)[key]
    }
  })
})

describe('pin ①-5 一表双渲染一致（renderIndexInjections 服务端形态，Node 直载实测）', () => {
  it('global 行渲染为 globalThis["NAME"] = JSON 赋值 script；style 行渲染进 head', async () => {
    const { renderIndexInjections } = (await importUpstream('host', '@deepseek-ai/dsh-host-webserver')) as {
      renderIndexInjections: (html: string, rows: readonly unknown[]) => string
    }
    const html = renderIndexInjections(
      '<html><head></head><body></body></html>',
      [
        { kind: 'global', name: '__DSH_BOOT__', value: { entries: [] } },
        { kind: 'style', text: 'p{margin:0}' },
        { kind: 'script-src', placement: 'body', src: 'app.js' },
      ],
    )
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('<script>globalThis["__DSH_BOOT__"] = {"entries":[]}</script>')
    expect(head).toContain('<style>p{margin:0}</style>')
    expect(html.slice(html.indexOf('<body>'))).toContain('<script src="app.js"></script>')
  })
})

describe('pin ①-6 我方镜像兼容（apps/host boot manifest 运输形状）', () => {
  it('buildBootManifest 接受 collectIndexInjections 同形行并冻结 {url, injections}', () => {
    const rows: unknown[] = [
      { kind: 'global', name: '__DSH_BOOT__', value: { entries: [], batches: [] } },
      { kind: 'script-src', placement: 'head', src: 'https://127.0.0.1/x/ui-theme.js' },
    ]
    const manifest = buildBootManifest('http://127.0.0.1:8421/', rows)
    expect(manifest.url).toBe('http://127.0.0.1:8421/')
    expect(manifest.injections).toEqual(rows)
    expect(Object.isFrozen(manifest)).toBe(true)
    expect(Object.isFrozen(manifest.injections)).toBe(true)
  })

  it('host 只运输不解释：非数组 injections 拒收（行形状校验归 dsh 两侧）', () => {
    expect(() => buildBootManifest('http://127.0.0.1:1/', 'nope' as unknown as readonly unknown[])).toThrow(
      /manifest\.injections 须为数组/,
    )
  })
})
