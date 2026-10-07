// M3 3.7 预设底稿契约 pin（AC1/AC4）：三底稿落面 + 镜像行 ↔ 上游 standard.patch.yml
// 机械 diff 一致 + 镜像行 config 全集（spike S5 教训：缺必填 config = 行 schema 拒 →
// 整预设 broken 不上菜单）+ 装载面（双锚解析/all-or-nothing fail-soft）。
// 上游读取 = profile.dev 物化树（runtime-packages 语境——RUNTIME_PACKAGES 同源供应面，
// 与 welcome ack/凭据桥 vendored pin 同惯例：existsSync 前置 = 环境缺口即红）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadPresetPatches, PRESET_PATCH_FILE_NAMES, resolvePresetPatchDir } from './presets.js'
import { hostRoot } from './paths.js'

const PRESETS_DIR = join(import.meta.dirname, 'presets')
const UPSTREAM = join(
  hostRoot(),
  'profile.dev',
  'node_modules',
  '@deepseek-ai',
  'dsh-web-app',
  'presets',
  'standard.patch.yml',
)

/** 插件行块抽取（10 空格缩进 `- id:` 分块——组内 14 空格嵌套行随块整体；尾随空行收敛） */
function pluginRowBlocks(text: string): Map<string, string> {
  const blocks = new Map<string, string[]>()
  let current: { id: string; buf: string[] } | undefined
  for (const line of text.split('\n')) {
    const match = /^ {10}- id: (\S+)\s*$/.exec(line)
    if (match !== null) {
      if (current !== undefined) blocks.set(current.id, current.buf)
      current = { id: match[1]!, buf: [line] }
      continue
    }
    if (current !== undefined) current.buf.push(line)
  }
  if (current !== undefined) blocks.set(current.id, current.buf)
  return new Map([...blocks].map(([id, buf]) => [id, buf.join('\n').trimEnd()]))
}

/** 行块内映射键全集（任意深度的 `key:` 行——config 全集断言的比较基） */
function blockKeys(block: string): Set<string> {
  const keys = new Set<string>()
  for (const line of block.split('\n')) {
    const match = /^\s+([A-Za-z][\w-]*):(?:\s|$)/.exec(line)
    if (match !== null) keys.add(match[1]!)
  }
  return keys
}

const upstreamText = existsSync(UPSTREAM) ? readFileSync(UPSTREAM, 'utf8') : ''
const upstreamRows = pluginRowBlocks(upstreamText)

/** 产品分叉行（镜像 diff 豁免——差集断言另立）与产品增量行（上游没有） */
const FORKED_ROWS = new Set(['persona', 'skill-filesystem'])
const PRODUCT_ROWS = new Set(['plugin-forge', 'plugin-forge-spec'])

describe('底稿前置（环境门）', () => {
  it('上游 standard.patch.yml 在场（profile.dev 物化树——缺席 = 环境缺口，先 pnpm -C apps/host/profile.dev install）', () => {
    expect(existsSync(UPSTREAM), UPSTREAM).toBe(true)
    expect(upstreamRows.size).toBeGreaterThan(0)
  })
})

describe('cordis.patch.yml 底稿（registry 覆写行）', () => {
  const text = readFileSync(join(PRESETS_DIR, PRESET_PATCH_FILE_NAMES.cordis), 'utf8')
  it('registry 行 default = expedition（Story 1：hero 座位缺省远征）——除头注释外零多余行', () => {
    expect(text).toContain('- id: agent-preset-registry\n  config:\n    default: expedition')
    const rows = text.split('\n').filter((line) => line !== '' && !line.startsWith('#'))
    expect(rows).toEqual(['- id: agent-preset-registry', '  config:', '    default: expedition'])
  })
})

for (const preset of ['expedition', 'blitz'] as const) {
  const text = readFileSync(join(PRESETS_DIR, PRESET_PATCH_FILE_NAMES[preset]), 'utf8')
  const rows = pluginRowBlocks(text)
  const isExpedition = preset === 'expedition'
  const modeName = isExpedition ? '远征模式' : '突击模式'

  describe(`${preset}.patch.yml 底稿（AC1 落面）`, () => {
    it('预设声明行：agent-preset 包名 + id/name（中文直出）/description/order', () => {
      expect(text).toContain(`    - id: preset-${preset}`)
      expect(text).toContain("      name: '@deepseek-ai/dsh-agent-preset'")
      expect(text).toContain(`        id: ${preset}`)
      expect(text).toContain(`        name: ${modeName}`)
      expect(text).toContain(`        description: "`)
      expect(text).toContain(`        order: ${isExpedition ? '1' : '2'}`)
    })

    it('standard 基础行 ↔ 上游机械 diff 一致（分叉行外逐字节——行集不缺不增）', () => {
      expect([...rows.keys()].filter((id) => !PRODUCT_ROWS.has(id))).toEqual([...upstreamRows.keys()])
      for (const [id, block] of upstreamRows) {
        if (FORKED_ROWS.has(id)) continue
        expect(rows.get(id), `${preset} 行 ${id} ↔ 上游漂移`).toBe(block)
      }
    })

    it('镜像行 config 全集（上游键 ⊆ 底稿键——缺必填 config = schema 拒 → 整预设 broken 不上菜单）', () => {
      for (const [id, block] of upstreamRows) {
        const mirror = rows.get(id)
        expect(mirror, `${preset} 行 ${id} 缺席`).toBeDefined()
        for (const key of blockKeys(block)) {
          expect(blockKeys(mirror!), `${preset} 行 ${id} 丢上游 config 键 ${key}`).toContain(key)
        }
      }
    })

    it('persona 分叉：suffix 逐字 + prefix 折叠块首行 = 上游平标量原文 + 作风行（只谈作风——不谈角色与工具禁令）', () => {
      const persona = rows.get('persona')!
      expect(persona).toContain('              suffix: Your working directory is {{cwd}}.')
      expect(persona).toContain('              prefix: >-')
      expect(persona).toContain('                You are a coding agent powered by the {{model}} model.')
      expect(persona).toMatch(isExpedition ? /远征作风：/ : /突击作风：/)
    })

    it('skill-filesystem 分叉：customSkillDirs 占位符（物化锚——!!js 全形态死刑，物化只出绝对路径）', () => {
      const skill = rows.get('skill-filesystem')!
      expect(skill).toContain('                - "{{plugin-forge-skills}}"')
      if (isExpedition) expect(skill).toContain('                - "{{plugin-forge-spec-skills}}"')
      else expect(skill).not.toContain('{{plugin-forge-spec-skills}}')
    })

    it(`产品增量行：plugin-forge 恒携${isExpedition ? ' + plugin-forge-spec（远征 spec 全量）' : '，物理无 plugin-forge-spec（Story 6：L1 物理隔离）'}`, () => {
      expect(rows.has('plugin-forge')).toBe(true)
      expect(text).toContain("            name: '@dsh-forge/plugin-forge'")
      expect(rows.has('plugin-forge-spec')).toBe(isExpedition)
      if (isExpedition) expect(text).toContain("            name: '@dsh-forge/plugin-forge-spec'")
      else expect(text).not.toContain('@dsh-forge/plugin-forge-spec')
    })

    it('增量行携带 bindingsFile 同 config（fix-1/drift #9：占位符物化——config-less 行内实例遮蔽全局配置实例断链的处置）', () => {
      // 行内产品行逐行形：config.bindingsFile 占位符（renderBootOverlay 物化与全局行同值）
      expect(text).toContain('            config:\n              bindingsFile: "{{plugin-forge-bindings}}"')
      const tokenRows = text.split('\n').filter((l) => l.trim() === 'bindingsFile: "{{plugin-forge-bindings}}"')
      expect(tokenRows).toHaveLength(isExpedition ? 2 : 1) // 远征 = plugin-forge + plugin-forge-spec；突击 = 恰 plugin-forge
    })

    it('底稿零 dogfood 专用行（llm-pi-ai/agent-default-model 不入产品底稿——spike 叠层专属）', () => {
      expect(text).not.toContain('agent-default-model')
      expect(text).not.toContain('llm-pi-ai')
    })
  })
}

describe('底稿装载（presets.ts）', () => {
  it('src 同邻目录三件齐装载（vitest 语境——cordis/expedition/blitz 全文在手）', () => {
    const patches = loadPresetPatches()
    expect(patches).toBeDefined()
    expect(patches!.cordis).toContain('- id: agent-preset-registry')
    expect(patches!.expedition).toContain('    - id: preset-expedition')
    expect(patches!.blitz).toContain('    - id: preset-blitz')
  })

  it('模块同邻锚：sibling presets/ 命中即取（不落 repo 回退）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-presets-'))
    try {
      const sibling = join(root, 'presets')
      mkdirSync(sibling)
      for (const name of Object.values(PRESET_PATCH_FILE_NAMES)) {
        writeFileSync(join(sibling, name), `# stub ${name}\n- id: stub\n`, 'utf8')
      }
      const moduleUrl = pathToFileURL(join(root, 'module.ts')).href
      expect(resolvePresetPatchDir(moduleUrl)).toBe(sibling)
      expect(loadPresetPatches(moduleUrl)?.cordis).toContain('- id: stub')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('all-or-nothing fail-soft：任一底稿缺席 → 整体 undefined（半套不注行——registry 不指向缺席预设）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-presets-partial-'))
    try {
      const sibling = join(root, 'presets')
      mkdirSync(sibling)
      writeFileSync(join(sibling, 'cordis.patch.yml'), '- id: agent-preset-registry\n', 'utf8') // expedition/blitz 缺席
      const moduleUrl = pathToFileURL(join(root, 'module.ts')).href
      // sibling 未命中（cordis 在但探测以 cordis 在场为准 → 命中 sibling）→ 读取时 blitz 缺席抛错 → undefined
      expect(loadPresetPatches(moduleUrl)).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
