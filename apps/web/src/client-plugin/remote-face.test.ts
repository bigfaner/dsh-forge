// 远程状态注入面单测（mobile-remote-approval 1.2——plugin.ts buildRemoteStatusSource）：
// 官方 remote.settings 反射面 → 三态快照；缺席/失败 = fail-soft off；setEnabled 官方
// settings.update 回写 + 即时 refresh（开关切换 → 图标态即时变化，状态单源零本地轮询）。
import { describe, expect, it } from 'vitest'
import { SIDEBAR_FOOTER_ACTION_SLOT, buildRemoteStatusSource, type ForgeClientCtx } from './plugin.js'

const OK_HOST = (host: string, revision = 3) => ({
  ok: true,
  value: { namespaces: [{ ns: 'webserver', value: { host, port: 8787 }, revision }] },
})

function fakeCtx(face: Record<string, unknown> | undefined): ForgeClientCtx {
  return {
    reflect: { get: (name: string) => (name === 'remote.settings' ? face : undefined) },
  } as unknown as ForgeClientCtx
}

describe('sidebar.footer.action 槽常量', () => {
  it('字面量 = 官方 dsh-client-ui-sidebar SlotMap 扩展槽（pin-06 探针锚同源）', () => {
    expect(SIDEBAR_FOOTER_ACTION_SLOT).toBe('sidebar.footer.action')
  })
})

describe('buildRemoteStatusSource', () => {
  it('describe 信封 → 快照三态（enabled 读数单源）', async () => {
    const remote = buildRemoteStatusSource(fakeCtx({ describe: () => Promise.resolve(OK_HOST('0.0.0.0')) }))
    await remote.refresh()
    expect(remote.source.getSnapshot().phase).toBe('listening')
    expect(remote.source.getSnapshot().lanAddress).toContain(':8787')

    const off = buildRemoteStatusSource(fakeCtx({ describe: () => Promise.resolve(OK_HOST('127.0.0.1')) }))
    await off.refresh()
    expect(off.source.getSnapshot().phase).toBe('off')
  })

  it('反射面缺席/调用失败 = fail-soft off 快照（不炸装配）', async () => {
    const absent = buildRemoteStatusSource(fakeCtx(undefined))
    await absent.refresh()
    expect(absent.source.getSnapshot().phase).toBe('off')

    const boom = buildRemoteStatusSource(fakeCtx({ describe: () => Promise.reject(new Error('boom')) }))
    await boom.refresh()
    expect(boom.source.getSnapshot().phase).toBe('off')
  })

  it('setEnabled 回写官方 settings.update（host 翻转 + expectedRevision）并即时 refresh', async () => {
    let host = '127.0.0.1'
    const writes: unknown[] = []
    const remote = buildRemoteStatusSource(
      fakeCtx({
        describe: () => Promise.resolve(OK_HOST(host)),
        update: (ns: string, patch: Record<string, unknown>, expectedRevision: number | undefined) => {
          writes.push({ ns, patch, expectedRevision })
          host = String(patch['host'])
          return Promise.resolve({ ok: true, value: { ns } })
        },
      }),
    )
    await remote.refresh()
    const before = remote.source.getSnapshot().phase
    const ok = await remote.setEnabled(true)
    expect(ok).toBe(true)
    expect(writes[0]).toEqual({ ns: 'webserver', patch: { host: '0.0.0.0' }, expectedRevision: 3 })
    expect(before).toBe('off')
    expect(remote.source.getSnapshot().phase).toBe('listening')
  })

  it('官方 update 缺席/失败 = setEnabled false（fail-soft，不改快照断言）', async () => {
    const remote = buildRemoteStatusSource(fakeCtx({ describe: () => Promise.resolve(OK_HOST('127.0.0.1')) }))
    await remote.refresh()
    expect(await remote.setEnabled(true)).toBe(false)
    expect(remote.source.getSnapshot().phase).toBe('off')
  })

  it('订阅面：refresh 后通知订阅者（useSyncExternalStore 直连契约）', async () => {
    const remote = buildRemoteStatusSource(fakeCtx({ describe: () => Promise.resolve(OK_HOST('127.0.0.1')) }))
    let notified = 0
    const dispose = remote.source.subscribe(() => {
      notified += 1
    })
    await remote.refresh()
    expect(notified).toBeGreaterThan(0)
    dispose()
  })
})
