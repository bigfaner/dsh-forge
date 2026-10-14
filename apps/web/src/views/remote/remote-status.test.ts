// 远程状态模型单测（mobile-remote-approval 1.2）——三态派生 + 官方 remote.settings describe
// 信封解析 + 局域网地址派生（状态单源纪律：模型只做「官方反射面读数 → 相位」纯映射）。
import { describe, expect, it } from 'vitest'
import { remoteLanAddressOf, remotePhaseOf, remoteSettingsProbeOf } from './remote-status.js'

describe('remotePhaseOf 三态派生', () => {
  it('远程关 = off（即便历史残留 devices 读数——关闭态压倒一切）', () => {
    expect(remotePhaseOf({ enabled: false })).toBe('off')
    expect(remotePhaseOf({ enabled: false, devicesConnected: true })).toBe('off')
  })

  it('监听中 = listening（开启且无设备连接）', () => {
    expect(remotePhaseOf({ enabled: true })).toBe('listening')
    expect(remotePhaseOf({ enabled: true, devicesConnected: false })).toBe('listening')
  })

  it('有设备已连接 = connected', () => {
    expect(remotePhaseOf({ enabled: true, devicesConnected: true })).toBe('connected')
  })
})

describe('remoteSettingsProbeOf 官方 describe 信封解析', () => {
  it('webserver 命名空间 host=0.0.0.0 → enabled true（携带 host/port/revision 供回写）', () => {
    const envelope = {
      ok: true,
      value: {
        namespaces: [
          { ns: 'webserver', value: { host: '0.0.0.0', port: 8787 }, revision: 3 },
          { ns: 'llm-deepseek', value: { apiKey: 'x' }, revision: 1 },
        ],
      },
    }
    expect(remoteSettingsProbeOf(envelope)).toEqual({
      ns: 'webserver',
      enabled: true,
      host: '0.0.0.0',
      port: 8787,
      revision: 3,
    })
  })

  it('host=127.0.0.1（回环）→ enabled false = 远程关', () => {
    const envelope = {
      ok: true,
      value: { namespaces: [{ ns: 'webserver', value: { host: '127.0.0.1', port: 8787 }, revision: 2 }] },
    }
    expect(remoteSettingsProbeOf(envelope)?.enabled).toBe(false)
  })

  it('ns 名不含 webserver 时按 host 字段形状识别（宿主命名空间名漂移防御）', () => {
    const envelope = {
      ok: true,
      value: { namespaces: [{ ns: 'host-webserver', value: { host: '0.0.0.0', port: 1 }, revision: 7 }] },
    }
    expect(remoteSettingsProbeOf(envelope)?.ns).toBe('host-webserver')
  })

  it('信封失败/畸形 = undefined（反射面缺席 fail-soft 灰态面）', () => {
    expect(remoteSettingsProbeOf(undefined)).toBeUndefined()
    expect(remoteSettingsProbeOf({ ok: false })).toBeUndefined()
    expect(remoteSettingsProbeOf({ ok: true, value: {} })).toBeUndefined()
    expect(remoteSettingsProbeOf({ ok: true, value: { namespaces: 'nope' } })).toBeUndefined()
  })
})

describe('remoteLanAddressOf 地址派生', () => {
  const probe = { ns: 'webserver', enabled: true, host: '0.0.0.0', port: 8787, revision: 3 }

  it('监听中 → http://<当前主机名>:<port>', () => {
    expect(remoteLanAddressOf(probe, '192.168.1.7')).toBe('http://192.168.1.7:8787')
  })

  it('关闭态/回环 = undefined（面板地址行回退提示语）', () => {
    expect(remoteLanAddressOf({ ...probe, enabled: false }, '192.168.1.7')).toBeUndefined()
    expect(remoteLanAddressOf({ ...probe, host: '127.0.0.1' }, 'localhost')).toBeUndefined()
    expect(remoteLanAddressOf({ ...probe, port: undefined }, '192.168.1.7')).toBeUndefined()
  })
})
