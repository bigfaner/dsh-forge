// 静态资源验签单测（1.31——X-Forge-Sig path‖body / 动态脚本验签后才执行 / 入口基线）。
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  entryTrustState,
  loadVerifiedScript,
  readTrustBaseline,
  recordTrustBaseline,
  verifyStaticResource,
  type KvStorage,
} from './static-verify.ts'
import { importHostPublicKey, keyIdOf } from './psk-crypto.ts'

const KP = generateKeyPairSync('ed25519')
const SPKI = KP.publicKey.export({ format: 'der', type: 'spki' }) as Buffer
const SPKI_B64 = SPKI.toString('base64')
const KEY_ID = createHash('sha256').update(SPKI).digest('hex').slice(0, 16)

const textEncoder = new TextEncoder()

function sigHeaders(path: string, body: string, keyId = KEY_ID): { 'x-forge-sig': string; 'x-forge-key-id': string } {
  const sig = sign(null, Buffer.concat([Buffer.from(path, 'utf8'), Buffer.from(body, 'utf8')]), KP.privateKey)
  return { 'x-forge-sig': sig.toString('base64'), 'x-forge-key-id': keyId }
}

function memoryStorage(): KvStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) }
}

describe('verifyStaticResource（host Ed25519 签名头核验）', () => {
  it('host 复刻签名 → mobile 验签通过；body/path 任一被篡改拒', async () => {
    const hostPublic = await importHostPublicKey(SPKI_B64)
    expect(await verifyStaticResource(hostPublic, KEY_ID, '/app.js', textEncoder.encode('code'), sigHeaders('/app.js', 'code'))).toBe(true)
    expect(await verifyStaticResource(hostPublic, KEY_ID, '/app.js', textEncoder.encode('evil'), sigHeaders('/app.js', 'code'))).toBe(false)
    expect(await verifyStaticResource(hostPublic, KEY_ID, '/other.js', textEncoder.encode('code'), sigHeaders('/app.js', 'code'))).toBe(false)
  })

  it('keyId 失配 / 签名头缺席 = false', async () => {
    const hostPublic = await importHostPublicKey(SPKI_B64)
    expect(await verifyStaticResource(hostPublic, KEY_ID, '/a.js', textEncoder.encode('c'), sigHeaders('/a.js', 'c', '0'.repeat(16)))).toBe(false)
    expect(await verifyStaticResource(hostPublic, KEY_ID, '/a.js', textEncoder.encode('c'), {})).toBe(false)
  })
})

describe('loadVerifiedScript（fetch → 验签 → 再 import）', () => {
  it('验签通过才执行 importSource；unverified/status 拒绝执行', async () => {
    const hostPublic = await importHostPublicKey(SPKI_B64)
    const executed: string[] = []
    const deps = {
      fetch: async (path: string) => ({ status: 200, text: `code-of-${path}`, headers: sigHeaders(path, `code-of-${path}`) }),
      importSource: (code: string) => { executed.push(code); return code },
    }
    const ok = await loadVerifiedScript('/a.js', hostPublic, KEY_ID, deps)
    expect(ok).toMatchObject({ ok: true, imported: 'code-of-/a.js' })
    expect(executed).toEqual(['code-of-/a.js'])

    const tampered = await loadVerifiedScript('/b.js', hostPublic, KEY_ID, {
      fetch: async (path) => ({ status: 200, text: 'evil', headers: sigHeaders(path, 'code') }),
      importSource: (code) => { executed.push(code); return code },
    })
    expect(tampered).toMatchObject({ ok: false, reason: 'unverified' })

    const missing = await loadVerifiedScript('/c.js', hostPublic, KEY_ID, {
      fetch: async () => ({ status: 404, text: '', headers: {} }),
      importSource: (code) => { executed.push(code); return code },
    })
    expect(missing).toMatchObject({ ok: false, reason: 'status' })
    expect(executed).toHaveLength(1)
  })
})

describe('入口受信基线（LAN 首激活建立）', () => {
  it('记录 → 双匹配 trusted；无基线/host 轮换 = unverified', async () => {
    const storage = memoryStorage()
    await recordTrustBaseline(storage, '<html>entry</html>', SPKI_B64)
    const baseline = readTrustBaseline(storage)
    expect(baseline?.hostKeyId).toBe(await keyIdOf(SPKI_B64))
    const entryHash = baseline?.entryHash ?? ''
    expect(entryTrustState(storage, entryHash, KEY_ID)).toBe('trusted')
    expect(entryTrustState(storage, 'different', KEY_ID)).toBe('unverified')
    expect(entryTrustState(memoryStorage(), entryHash, KEY_ID)).toBe('unverified')
  })
})
