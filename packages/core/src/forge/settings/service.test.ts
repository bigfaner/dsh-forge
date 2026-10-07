// 任务 2.7 测试 —— core forgeSettings 服务（tech-design §Interface 1 M3 + 图 11 设置单门）：
// get/set/持久化往返 + 未配置态（文件缺席 → {} 不抛——UI ⚠ 显式占位判据）+ 路径守卫
// （userData 域外拒）+ 原子写（tmp + rename 无残留）+ 写校验（worker 三项形状）。
// 存储形状单测逐字节锚定（稳定序列化——同 host bindingsFile 先例口径）。
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { InvalidSettingsInputError, SettingsPathInvalidError } from './errors.js'
import { createSettingsService } from './service.js'

let root: string | undefined
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/** 夹具：userData 域（临时根）+ 域内设置文件路径（{userData}/forge-settings.json 同形） */
function harness(): { userDataDir: string; settingsFile: string } {
  root ??= mkdtempSync(join(tmpdir(), 'dsh-forge-settings-'))
  return { userDataDir: root, settingsFile: join(root, 'forge-settings.json') }
}

const worker = { provider: 'deepseek', model: 'reasoner', reasoning: 'high' } as const

describe('2.7 forgeSettings：未配置态 + get/set 往返', () => {
  it('未配置态：文件缺席 → get() 返回 {} 不抛错（worker 键缺席——dispatchTask 不携带 agentOptions 回退父会话继承）', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await expect(svc.get()).resolves.toEqual({})
    expect(existsSync(settingsFile)).toBe(false) // 只读不建文件
  })

  it('往返：set(worker 三项) → get 逐字段一致；文件落盘 settingsFile 路径（单门存储）', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ worker })
    await expect(svc.get()).resolves.toEqual({ worker })
    expect(existsSync(settingsFile)).toBe(true)
  })

  it('持久化 + 稳定形状：新服务实例（同路径）读旧 set——文件即事实源（改完即生效无重启）；序列化 = 2 空格缩进 + 尾换行', async () => {
    const { userDataDir, settingsFile } = harness()
    await createSettingsService({ settingsFile, userDataDir }).set({ worker })
    const again = createSettingsService({ settingsFile, userDataDir })
    await expect(again.get()).resolves.toEqual({ worker })
    expect(readFileSync(settingsFile, 'utf8')).toBe(`${JSON.stringify({ worker }, null, 2)}\n`)
  })

  it('整体覆写：二次 set 新 worker → get 反映新值（worker 段覆写语义——UI 设置分区保存脏态）', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ worker })
    const next = { provider: 'openai', model: 'gpt-5', reasoning: 'low' } as const
    await svc.set({ worker: next })
    await expect(svc.get()).resolves.toEqual({ worker: next })
  })
})

describe('2.7 forgeSettings：原子写 + 写校验', () => {
  it('原子写：set 后目录仅目标文件（同目录 tmp + rename 无 .tmp 残留）', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ worker })
    expect(readdirSync(root!)).toEqual(['forge-settings.json'])
  })

  it('写校验：reasoning ∉ 三档 / provider·model 空白 → InvalidSettingsInputError，既有文件不被触碰', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ worker })
    await expect(
      svc.set({ worker: { provider: 'deepseek', model: 'reasoner', reasoning: 'ultra' as never } }),
    ).rejects.toBeInstanceOf(InvalidSettingsInputError)
    await expect(
      svc.set({ worker: { provider: '  ', model: 'reasoner', reasoning: 'low' } }),
    ).rejects.toBeInstanceOf(InvalidSettingsInputError)
    await expect(
      svc.set({ worker: { provider: 'deepseek', model: '', reasoning: 'low' } }),
    ).rejects.toBeInstanceOf(InvalidSettingsInputError)
    // 拒绝路径零副作用：文件内容原样、无 tmp 残留
    expect(JSON.parse(readFileSync(settingsFile, 'utf8'))).toEqual({ worker })
    expect(readdirSync(root!)).toEqual(['forge-settings.json'])
  })

  it('损坏容错：文件非 JSON / 顶层非对象 → get 描述性拒绝（fail-loud——单写者 = core，外部改写即损坏不静默降级）', async () => {
    const { userDataDir, settingsFile } = harness()
    writeFileSync(settingsFile, 'not-json{', 'utf8')
    const svc = createSettingsService({ settingsFile, userDataDir })
    await expect(svc.get()).rejects.toThrow(/解析失败/)
    writeFileSync(settingsFile, '[1, 2]', 'utf8')
    await expect(svc.get()).rejects.toThrow(/解析失败/)
  })
})

describe('2.7 forgeSettings：路径守卫（userData 域外拒）', () => {
  it('settingsFile 在 userData 域外（`..` 逃逸）→ 构造即拒 SettingsPathInvalidError（装配期 fail-loud——单写者写面永不落域外）', () => {
    const { userDataDir } = harness()
    const outside = join(userDataDir, '..', 'forge-settings.json')
    expect(() => createSettingsService({ settingsFile: outside, userDataDir })).toThrow(SettingsPathInvalidError)
  })

  it('同前缀目录不误放行（`<root>` vs `<root>-x`——sep 纪律）', () => {
    const { userDataDir } = harness()
    const sibling = `${userDataDir}-x`
    expect(() => createSettingsService({ settingsFile: join(sibling, 'forge-settings.json'), userDataDir })).toThrow(
      SettingsPathInvalidError,
    )
  })

  it('域内嵌套路径放行（守卫通过——canonical 前缀 + 分隔符双条件）', async () => {
    const { userDataDir } = harness()
    const nested = join(userDataDir, 'sub', 'forge-settings.json')
    const svc = createSettingsService({ settingsFile: nested, userDataDir })
    await svc.set({ worker })
    await expect(svc.get()).resolves.toEqual({ worker })
  })
})
