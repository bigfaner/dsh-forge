// 4.2 boot overlay pin：产品插件行 config 的装配期注入形状（patchFiles 叠层——
// 用户层之后应用，按 row id 整体替换 config；YAML 双引号标量承载 Windows 路径）。
// fix-12：welcome ack 预置行形状 + 上游版本常量 pin（升级窗口机械核查）。
// fix-26：凭据桥行形状（credentialsPath 在场注入 / 缺席不桥）+ 官方缝 pin。
// 3.4 M2 装配缝三面：core 行 tasksHome / plugin-forge 行 bindingsFile（与 knowledge
// 同一绑定表文件）/ skill-filesystem 行 customSkillDirs（plugin-forge skills 物理挂载）。
// M3 3.7 预设装配：registry default 覆写 + 远征/突击双预设行每启注行（物化分叉——
// customSkillDirs 当形态绝对路径；!!js 全形态死刑零表达式残留；缺席 fail-soft 不注行）。
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderBootOverlay, WELCOME_NOTICE_ACK_VERSION, writeBootOverlay } from './overlay.js'
import { hostRoot } from '../profile/paths.js'
import { loadPresetPatches } from '../profile/presets.js'

describe('renderBootOverlay（纯函数形状）', () => {
  it('两产品行 config 注入：dbFile / bindingsFile 双引号标量（反斜杠转义）', () => {
    const text = renderBootOverlay({
      stateDb: 'C:\\app-data\\dsh-forge\\state.db',
      bindingsFile: 'C:\\app-data\\dsh-forge\\knowledge-bindings.json',
    })
    expect(text).toBe(
      [
        '# dsh-forge boot overlay（host 每启重写——产品插件行 config 注入；非用户层状态）',
        '- id: dsh-forge-core',
        '  config:',
        '    dbFile: "C:\\\\app-data\\\\dsh-forge\\\\state.db"',
        '- id: dsh-forge-knowledge',
        '  config:',
        '    bindingsFile: "C:\\\\app-data\\\\dsh-forge\\\\knowledge-bindings.json"',
        '- id: dsh-forge-plugin-forge',
        '  config:',
        '    bindingsFile: "C:\\\\app-data\\\\dsh-forge\\\\knowledge-bindings.json"',
        '- id: ui-settings-general',
        '  config:',
        `    welcomeNoticeVersion: "${WELCOME_NOTICE_ACK_VERSION}"`,
        '',
      ].join('\n'),
    )
  })

  it('行 id 定位用户层产品行（patch 按 row id 整体替换 config——非 insert 新行）', () => {
    const text = renderBootOverlay({ stateDb: '/x/state.db', bindingsFile: '/x/b.json' })
    expect(text).toContain('- id: dsh-forge-core')
    expect(text).toContain('- id: dsh-forge-knowledge')
    expect(text).toContain('- id: dsh-forge-plugin-forge')
    expect(text).not.toContain('- insert')
    expect(text).not.toContain('disabled')
  })

  it('正斜杠路径不转义（POSIX 形态原样）', () => {
    const text = renderBootOverlay({ stateDb: '/tmp/ud/state.db', bindingsFile: '/tmp/ud/b.json' })
    expect(text).toContain('dbFile: "/tmp/ud/state.db"')
  })

  it('welcome ack 预置行：官方等值比对常量双引号标量（fix-12）', () => {
    const text = renderBootOverlay({ stateDb: '/x/s.db', bindingsFile: '/x/b.json' })
    // 官方 WelcomeNoticeStore 逐字等值比对（===）——YAML 引号标量防日期式再解析
    expect(text).toContain(`- id: ui-settings-general\n  config:\n    welcomeNoticeVersion: "${WELCOME_NOTICE_ACK_VERSION}"`)
  })

  it('凭据桥行（fix-26）：credentialsPath 在场 → credentials 行 config.path 注入（反斜杠转义同产品行）', () => {
    const text = renderBootOverlay({
      stateDb: '/x/state.db',
      bindingsFile: '/x/b.json',
      credentialsPath: 'C:\\Users\\u\\.dsh\\.credentials.yaml',
    })
    expect(text).toContain(
      '- id: credentials\n  config:\n    path: "C:\\\\Users\\\\u\\\\.dsh\\\\.credentials.yaml"',
    )
  })

  it('凭据桥门（fix-26）：credentialsPath 缺席 → 无 credentials 行（e2e/测试隔离态不读真凭据）', () => {
    const text = renderBootOverlay({ stateDb: '/x/s.db', bindingsFile: '/x/b.json' })
    expect(text).not.toContain('- id: credentials')
    expect(text).not.toContain('credentials.yaml')
  })

  it('M2 装配缝（3.4）：tasksHome 在场 → core 行 config 增字段（dbFile 重述——整行替换纪律）', () => {
    const text = renderBootOverlay({ stateDb: '/x/s.db', bindingsFile: '/x/b.json', tasksHome: 'C:\\ws\\tasks' })
    expect(text).toContain(
      ['- id: dsh-forge-core', '  config:', '    dbFile: "/x/s.db"', '    tasksHome: "C:\\\\ws\\\\tasks"'].join('\n'),
    )
  })

  it('M2 装配缝（3.4）：tasksHome 缺席 → core 行仅 dbFile（M2 四域降级装配形态）', () => {
    const text = renderBootOverlay({ stateDb: '/x/s.db', bindingsFile: '/x/b.json' })
    expect(text).not.toContain('tasksHome')
  })

  it('技能面挂载（3.4/5.4 修正）：skillsDir 在场 → 行显式再启用（disabled:false——官方 web-app 层禁用主机行，patch 缺字段沿用禁用）+ 纯部署级 provider（includeDefaultRoots:false）+ customSkillDirs 列表', () => {
    const text = renderBootOverlay({
      stateDb: '/x/s.db',
      bindingsFile: '/x/b.json',
      skillsDir: 'C:\\app\\node_modules\\@dsh-forge\\plugin-forge\\skills',
    })
    expect(text).toContain(
      [
        '- id: skill-filesystem',
        '  disabled: false',
        '  config:',
        '    includeDefaultRoots: false',
        '    customSkillDirs:',
        '      - "C:\\\\app\\\\node_modules\\\\@dsh-forge\\\\plugin-forge\\\\skills"',
      ].join('\n'),
    )
  })

  it('技能面挂载（3.4）：skillsDir 缺席 → 无 skill-filesystem 行（fail-soft 技能面降级）', () => {
    const text = renderBootOverlay({ stateDb: '/x/s.db', bindingsFile: '/x/b.json' })
    expect(text).not.toContain('skill-filesystem')
    expect(text).not.toContain('customSkillDirs')
  })
})

describe('welcome ack 常量 pin（fix-12——上游升级窗口机械核查）', () => {
  it('overlay 常量 === 官方 vendored 副本内 WELCOME_NOTICE_VERSION（bump 即红）', () => {
    // dev 形态运行时真实消费副本（profile.dev/node_modules——loader 插件链装载面）
    const vendored = join(
      hostRoot(),
      'profile.dev',
      'node_modules',
      '@deepseek-ai',
      'dsh-client-ui-settings-models',
      'lib',
      'client.js',
    )
    expect(existsSync(vendored)).toBe(true) // 前置：profile.dev 未安装 = 环境缺口（paths.test 同依赖）
    const match = readFileSync(vendored, 'utf8').match(/WELCOME_NOTICE_VERSION = "([^"]+)"/)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe(WELCOME_NOTICE_ACK_VERSION)
  })
})

// fix-26 凭据桥官方缝 pin——上游升级窗口机械核查（同 welcome ack 常量 pin 惯例）：桥合法性
// 全押三处官方形状——resolveSpec 显式 path 优先缝（桥的机制前提）、credentials 文档名
// （paths.ts resolveCredentialsBridge 硬编码名等值）、dsh-base roster 行 id（overlay 按
// row id 整体替换 config——id 漂移 = 注入落空成新行）
describe('凭据桥官方缝 pin（fix-26）', () => {
  it('dsh-credentials-local：resolveSpec config.path 显式优先于 home 拼接 + 文档名常量', () => {
    const vendored = join(
      hostRoot(),
      'profile.dev',
      'node_modules',
      '@deepseek-ai',
      'dsh-credentials-local',
      'lib',
      'index.js',
    )
    expect(existsSync(vendored)).toBe(true) // 前置：profile.dev 未安装 = 环境缺口（welcome ack pin 同依赖）
    const text = readFileSync(vendored, 'utf8')
    expect(text).toContain('config.path ?? join(resolveDshHome(config.dshHome)') // 显式 path 缝在场
    expect(text).toMatch(/CREDENTIALS_FILENAME = "\.credentials\.yaml"/) // 文档名 = 桥路径文件名
  })

  it('dsh-base cordis.patch.yml：credentials 行在场（overlay 行 id 匹配官方 roster）', () => {
    const patch = join(
      hostRoot(),
      'profile.dev',
      'node_modules',
      '@deepseek-ai',
      'dsh-base',
      'cordis.patch.yml',
    )
    expect(existsSync(patch)).toBe(true)
    expect(readFileSync(patch, 'utf8')).toContain(
      "- id: credentials\n      name: '@deepseek-ai/dsh-credentials-local'",
    )
  })
})

describe('M3 预设装配（3.7）——renderBootOverlay 物化分叉', () => {
  const base = { stateDb: '/x/s.db', bindingsFile: '/x/b.json' }
  // 真实三底稿（src 同邻装载——presets.test.ts 另 pin 底稿契约面）
  const patches = loadPresetPatches()!
  const withPresets = (over: { coreSkillsDir?: string; specSkillsDir?: string } = {}) => ({
    ...base,
    presets: { ...patches, coreSkillsDir: '/c/skills', specSkillsDir: '/c/spec-skills', ...over },
  })

  it('双预设上场（AC6 形制）：registry default = 远征覆写 + 预设声明行（中文 name 直出·order 1/2）', () => {
    const text = renderBootOverlay(withPresets())
    expect(text).toContain('- id: agent-preset-registry\n  config:\n    default: expedition')
    expect(text).toContain("    - id: preset-expedition\n      name: '@deepseek-ai/dsh-agent-preset'")
    expect(text).toContain('        id: expedition\n        name: 远征模式')
    expect(text).toContain('        order: 1')
    expect(text).toContain("    - id: preset-blitz\n      name: '@deepseek-ai/dsh-agent-preset'")
    expect(text).toContain('        id: blitz\n        name: 突击模式')
    expect(text).toContain('        order: 2')
    // 远征/突击顺序 = 声明序（registry 菜单 order 排序数据面）
    expect(text.indexOf('preset-expedition')).toBeLessThan(text.indexOf('preset-blitz'))
  })

  it('物化绝对路径（AC2）：customSkillDirs 占位符 → 当形态绝对路径双引号标量——远征 [core,spec] / 突击 [core]', () => {
    const text = renderBootOverlay(
      withPresets({ coreSkillsDir: 'C:\\app\\node_modules\\@dsh-forge\\plugin-forge\\skills', specSkillsDir: 'C:\\app\\node_modules\\@dsh-forge\\plugin-forge-spec\\skills' }),
    )
    const core = '- "C:\\\\app\\\\node_modules\\\\@dsh-forge\\\\plugin-forge\\\\skills"'
    const spec = '- "C:\\\\app\\\\node_modules\\\\@dsh-forge\\\\plugin-forge-spec\\\\skills"'
    expect(text).toContain(core)
    expect(text).toContain(spec)
    // 突击段物理不含 spec 路径（Story 6：L1 物理隔离——按段切片断言）
    const blitzSection = text.slice(text.indexOf('preset-blitz'))
    expect(blitzSection).toContain(core)
    expect(blitzSection).not.toContain(spec)
    expect(text).not.toContain('{{plugin-forge') // 占位符零残留
  })

  it('!!js 全形态死刑（AC5）：物化输出零表达式残留——平台门行就地求值具体布尔', () => {
    const text = renderBootOverlay(withPresets())
    expect(text).not.toContain('!!js')
    expect(text).not.toContain('createRequire')
    const win32 = process.platform === 'win32'
    expect(text).toContain(`disabled: ${String(win32)}`) // tool-bash（win32 禁）
    expect(text).toContain(`disabled: ${String(!win32)}`) // tool-pwsh（非 win32 禁）
  })

  it('spec 目录缺席 fail-soft：远征 customSkillDirs 仅 [core]（spec 行剔除·无空列表残留）', () => {
    const text = renderBootOverlay(withPresets({ specSkillsDir: undefined }))
    expect(text).toContain('customSkillDirs:\n                - "/c/skills"')
    expect(text).not.toContain('/c/spec-skills')
    expect(text).not.toContain('{{plugin-forge')
  })

  it('双目录皆缺席：预设内 skill-filesystem 行回归上游裸形态（config 空块整除——schema 面零残留）', () => {
    const text = renderBootOverlay(withPresets({ coreSkillsDir: undefined, specSkillsDir: undefined }))
    expect(text).toContain(
      "          - id: skill-filesystem\n            name: '@deepseek-ai/dsh-skill-filesystem'\n          - id: tool-skill",
    )
    expect(text).not.toContain('customSkillDirs')
  })

  it('presets 缺席 → 预设面整体不注行（fail-soft；既有输出零变化）', () => {
    const text = renderBootOverlay(base)
    expect(text).not.toContain('agent-preset-registry')
    expect(text).not.toContain('preset-expedition')
    expect(text).not.toContain('preset-blitz')
    expect(text).not.toContain('远征模式')
  })

  it('底稿头注释不进 overlay + plan-mode section 逐字保真（空行/段落——行块本体零损耗）', () => {
    const text = renderBootOverlay(withPresets())
    expect(text).not.toMatch(/^# dsh-forge 预设底稿/m)
    expect(text).toContain('                  section: |')
    expect(text).toContain('                    You are in plan mode. Stay in plan mode until exit_plan_mode succeeds')
    // section 内空行保真（段落分隔——物化只动占位符/平台门/注释行，plan-mode 六段结构零损耗）
    expect(text).toMatch(/submit it through exit_plan_mode\.\n\n {20}Explore first\./)
  })
})

describe('writeBootOverlay（落地机制）', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-forge-overlay-'))
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('返回目标路径并写入渲染文本（深层目录自动创建；重写幂等）', () => {
    const target = join(dir, 'nested', 'boot-overlay.yml')
    expect(writeBootOverlay(target, { stateDb: 'C:\\s.db', bindingsFile: 'C:\\b.json' })).toBe(target)
    expect(readFileSync(target, 'utf8')).toBe(renderBootOverlay({ stateDb: 'C:\\s.db', bindingsFile: 'C:\\b.json' }))
    writeBootOverlay(target, { stateDb: 'C:\\s2.db', bindingsFile: 'C:\\b2.json' })
    expect(readFileSync(target, 'utf8')).toContain('s2.db')
  })
})
