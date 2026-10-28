// 任务 2.7 测试 —— core forgeSettings 服务（tech-design §Interface 1 M3 + 图 11 设置单门）：
// get/set/持久化往返 + 未配置态（文件缺席 → {} 不抛——UI ⚠ 显式占位判据）+ 路径守卫
// （userData 域外拒）+ 原子写（tmp + rename 无残留）+ 写校验（worker 三项形状）。
// 存储形状单测逐字节锚定（稳定序列化——同 host bindingsFile 先例口径）。
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { InvalidSettingsInputError, SettingsPathInvalidError } from './errors.js'
import { createSettingsService, flywheelReviewWaveThreshold } from './service.js'

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

  it("往返：reasoning='default'（默认值档——不下发 effort）合法收存", async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    const defaulted = { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoning: 'default' } as const
    await svc.set({ worker: defaulted })
    await expect(svc.get()).resolves.toEqual({ worker: defaulted })
  })

  // ── fix-3（mobile-remote-approval）：remoteApproval 分节（重启生效形态——开关写产品自有配置） ──
  it('fix-3 分节覆写：只 set remoteApproval → worker 段保留（读-改-写分节合并——手机远程开关单节写不冲掉 worker 配置）', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ worker })
    await svc.set({ remoteApproval: { enabled: true } })
    await expect(svc.get()).resolves.toEqual({ worker, remoteApproval: { enabled: true } })
    await svc.set({ remoteApproval: { enabled: false } })
    await expect(svc.get()).resolves.toEqual({ worker, remoteApproval: { enabled: false } })
  })

  it('fix-3 空配置开关写入：未配置文件 + 只 set remoteApproval → get 只含该节', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ remoteApproval: { enabled: true } })
    await expect(svc.get()).resolves.toEqual({ remoteApproval: { enabled: true } })
  })

  it('fix-3 写校验：remoteApproval.enabled 非布尔 / 两节全缺 → InvalidSettingsInputError，既有文件不被触碰', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ worker })
    await expect(
      svc.set({ remoteApproval: { enabled: 'yes' as never } }),
    ).rejects.toBeInstanceOf(InvalidSettingsInputError)
    await expect(svc.set({} as never)).rejects.toBeInstanceOf(InvalidSettingsInputError)
    expect(JSON.parse(readFileSync(settingsFile, 'utf8'))).toEqual({ worker })
  })

  // ── worktree 分节（跨分支风险「不再提示」持久化）──
  it('worktree 分节覆写：只 set worktree → worker/remoteApproval 段保留（分节合并同 fix-3 口径）；get 往返一致', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ worker })
    await svc.set({ worktree: { crossBranchRiskDismissed: true } })
    await expect(svc.get()).resolves.toEqual({ worker, worktree: { crossBranchRiskDismissed: true } })
    await svc.set({ worktree: { crossBranchRiskDismissed: false } })
    await expect(svc.get()).resolves.toEqual({ worker, worktree: { crossBranchRiskDismissed: false } })
  })

  it('worktree 写校验：crossBranchRiskDismissed 非布尔 → InvalidSettingsInputError，既有文件不被触碰', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ worker })
    await expect(
      svc.set({ worktree: { crossBranchRiskDismissed: 'yes' as never } }),
    ).rejects.toBeInstanceOf(InvalidSettingsInputError)
    expect(JSON.parse(readFileSync(settingsFile, 'utf8'))).toEqual({ worker })
  })

  // ── 机械⑦（forge-verification-hardening）：flywheel 分节——飞轮修正波次阈值（无 UI，文件/服务面配置） ──
  it('flywheel 默认值生效：键缺席（未配置文件 / 文件无 flywheel 节）→ flywheelReviewWaveThreshold = 默认 6', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    const unconfigured = await svc.get()
    expect(flywheelReviewWaveThreshold(unconfigured)).toBe(6) // 文件缺席 = 未配置态
    await svc.set({ worker })
    expect(flywheelReviewWaveThreshold(await svc.get())).toBe(6) // 文件在、flywheel 键缺席同样默认
  })

  it('flywheel 显式配置：set { reviewWaveThreshold } → get 往返一致、取值反映显式值；分节覆写不冲掉其它节', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ worker })
    await svc.set({ flywheel: { reviewWaveThreshold: 4 } })
    const settings = await svc.get()
    expect(settings.flywheel).toEqual({ reviewWaveThreshold: 4 })
    expect(flywheelReviewWaveThreshold(settings)).toBe(4)
    expect(settings.worker).toEqual(worker) // 读-改-写分节合并保留既有节
    // 持久化：新服务实例（同路径）读旧 set——文件即事实源
    await expect(createSettingsService({ settingsFile, userDataDir }).get()).resolves.toEqual({
      worker,
      flywheel: { reviewWaveThreshold: 4 },
    })
  })

  it('flywheel 写校验：reviewWaveThreshold 非 ≥1 整数（0 / 负数 / 小数 / 非数值）→ InvalidSettingsInputError，既有文件不被触碰', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ flywheel: { reviewWaveThreshold: 6 } })
    for (const bad of [0, -1, 1.5, 'six', true, null]) {
      await expect(
        svc.set({ flywheel: { reviewWaveThreshold: bad as never } }),
      ).rejects.toBeInstanceOf(InvalidSettingsInputError)
    }
    expect(JSON.parse(readFileSync(settingsFile, 'utf8'))).toEqual({ flywheel: { reviewWaveThreshold: 6 } })
  })

  it('experts 分节覆写：set { mapping } → get 往返一致；分节合并不冲掉其它节；分节空缺不拒（mapping 键缺席 = 默认映射生效）', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ worker })
    await svc.set({ experts: { mapping: { 'coding-fix': 'my-fix-expert' } } })
    const settings = await svc.get()
    expect(settings.experts).toEqual({ mapping: { 'coding-fix': 'my-fix-expert' } })
    expect(settings.worker).toEqual(worker) // 读-改-写分节合并保留既有节
    // 空节合法（{}——未列任何覆盖 = 全默认映射）；新实例读回文件事实源
    await svc.set({ experts: {} })
    await expect(createSettingsService({ settingsFile, userDataDir }).get()).resolves.toEqual({
      worker,
      experts: {},
    })
  })

  it('experts 写校验：mapping 非对象 / 未知任务类型键 / 空白专家键值 → InvalidSettingsInputError，既有文件不被触碰', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ experts: { mapping: { gate: 'my-gate' } } })
    await expect(svc.set({ experts: { mapping: 'nope' as never } })).rejects.toBeInstanceOf(InvalidSettingsInputError)
    await expect(svc.set({ experts: { mapping: { 'doc.fix': 'x' } } as never })).rejects.toBeInstanceOf(InvalidSettingsInputError)
    await expect(svc.set({ experts: { mapping: { gate: '  ' } } })).rejects.toBeInstanceOf(InvalidSettingsInputError)
    await expect(svc.set({ experts: { mapping: { gate: 7 } } as never })).rejects.toBeInstanceOf(InvalidSettingsInputError)
    await expect(svc.set({} as never)).rejects.toBeInstanceOf(InvalidSettingsInputError) // 五节全缺
    expect(JSON.parse(readFileSync(settingsFile, 'utf8'))).toEqual({ experts: { mapping: { gate: 'my-gate' } } })
  })
})

describe('2.7 forgeSettings：原子写 + 写校验', () => {
  it('原子写：set 后目录仅目标文件（同目录 tmp + rename 无 .tmp 残留）', async () => {
    const { userDataDir, settingsFile } = harness()
    const svc = createSettingsService({ settingsFile, userDataDir })
    await svc.set({ worker })
    expect(readdirSync(root!)).toEqual(['forge-settings.json'])
  })

  it('写校验：reasoning ∉ 四档（含默认值）/ provider·model 空白 → InvalidSettingsInputError，既有文件不被触碰', async () => {
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

  it('#60 符号链接拼写 + 首启文件缺席 → 放行不误拒（缺席侧逐级上溯最近存在祖先 realpath + 余段拼接——与 userDataDir 侧同口径；词法 /tmp/... vs realpath /private/tmp/... 前缀失配即此病灶）', async () => {
    const real = mkdtempSync(join(tmpdir(), 'dsh-forge-settings-real-'))
    const link = join(tmpdir(), `dsh-forge-settings-link-${randomUUID()}`)
    try {
      // Windows 无特权符号链接（EPERM）→ junction 同构复现（realpathSync 同样展开到真值拼写）
      symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'EPERM') return // 受限容器无符号链接权：跳过——CI 覆盖
      throw cause
    }
    try {
      // 旧实现在此抛 SettingsPathInvalidError → core 插件不激活 → 全 forge:* 通道缺席
      const svc = createSettingsService({ userDataDir: link, settingsFile: join(link, 'forge-settings.json') })
      await expect(svc.get()).resolves.toEqual({})
      await svc.set({ worker })
      expect(existsSync(join(real, 'forge-settings.json'))).toBe(true) // 落盘经 realpath 真值目录
      // 多级缺席（sub 目录也未建）逐级上溯同样不误拒
      expect(() =>
        createSettingsService({ userDataDir: link, settingsFile: join(link, 'sub', 'forge-settings.json') }),
      ).not.toThrow()
    } finally {
      // recursive 摘除：junction（EISDIR 防线）与 POSIX symlink 皆只摘链接、不触真值目录
      rmSync(link, { recursive: true, force: true })
      rmSync(real, { recursive: true, force: true })
    }
  })
})
