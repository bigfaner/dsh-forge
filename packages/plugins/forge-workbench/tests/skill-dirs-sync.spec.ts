// skill-dirs-sync.spec — task 5.7 机制面单测(AC 矩阵:首写/去重/漂移重写/
// 前缀拒绝/告警)。全部走临时用户配置 fixture(真实临时 profile 目录 + 伪插件
// 物化),零 mock fs —— 手术编辑器与 marker 的文件级行为即被测对象。
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PLUGIN_NAME,
  PROFILE_PATCH_FILENAME,
  SKILL_DIRS_MARKER_FILENAME,
  SKILL_PROVIDER_ROW_ID,
  applySkillDirsToPatchText,
  computeSkillManifestHash,
  installRootOf,
  isPathInside,
  planCustomSkillDirs,
  readSkillDirsMarker,
  syncSkillDirs,
} from '../src/host/skill-dirs/sync.ts'

/** 临时 fixture:profile 目录 + 伪插件物化(node_modules 下的包目录)+ 技能树。 */
interface Fixture {
  readonly profileDir: string
  readonly pluginDir: string
  readonly skillRoot: string
  dispose(): void
}

function createFixture(skills: readonly string[] = ['submit-task', 'git-commit', 'write-prd']): Fixture {
  const profileDir = mkdtempSync(join(tmpdir(), 'dsh-forge-skill-dirs-'))
  const pluginDir = join(profileDir, 'node_modules', '@dsh-forge', 'plugin-forge-workbench')
  const skillRoot = join(pluginDir, 'resources', 'skills')
  for (const name of skills) {
    mkdirSync(join(skillRoot, name), { recursive: true })
    writeFileSync(join(skillRoot, name, 'SKILL.md'), `---\nname: ${name}\ndescription: fixture skill ${name}\n---\n\nbody\n`)
  }
  return {
    profileDir,
    pluginDir,
    skillRoot,
    dispose: () => { rmSync(profileDir, { recursive: true, force: true }) },
  }
}

const fixtures: Fixture[] = []
afterEach(() => {
  while (fixtures.length > 0) fixtures.pop()?.dispose()
})

function fixture(skills?: readonly string[]): Fixture {
  const one = createFixture(skills)
  fixtures.push(one)
  return one
}

function patchPath(fx: Fixture): string {
  return join(fx.profileDir, PROFILE_PATCH_FILENAME)
}

function readPatch(fx: Fixture): string {
  return readFileSync(patchPath(fx), 'utf8')
}

// ---------------------------------------------------------------------------
// AC1:首写 + 追加(去重,不破坏用户既有条目)
// ---------------------------------------------------------------------------

describe('task 5.7 syncSkillDirs — first write (AC1)', () => {
  it('creates the user-layer patch with the managed skill-filesystem row when absent', () => {
    const fx = fixture()
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('written')
    expect(result.changes.length).toBeGreaterThan(0)
    const text = readPatch(fx)
    // 产物形态:注释头 + 受管行(config.customSkillDirs 单条技能根,单引号标量)。
    expect(text).toContain(`- id: ${SKILL_PROVIDER_ROW_ID}`)
    expect(text).toContain('  config:')
    expect(text).toContain('    customSkillDirs:')
    expect(text.trimEnd().endsWith(`- '${fx.skillRoot}'`)).toBe(true)
    // marker 落盘:技能根 + 清单 hash。
    const marker = readSkillDirsMarker(fx.profileDir)
    expect(marker?.version).toBe(1)
    expect(marker?.plugins[PLUGIN_NAME]?.skillRoot).toBe(fx.skillRoot)
    expect(marker?.plugins[PLUGIN_NAME]?.manifestHash).toBe(computeSkillManifestHash(fx.skillRoot))
  })

  it('replaces the vendored `[]` template while keeping its comments', () => {
    const fx = fixture()
    writeFileSync(patchPath(fx), '# Your patch layer for this dsh profile, applied after every bundle layer:\n# a top-level YAML array of loader patch entries.\n[]\n')
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('written')
    const text = readPatch(fx)
    expect(text).toContain('# Your patch layer for this dsh profile')
    expect(text).not.toContain('[]')
    expect(text).toContain(`- id: ${SKILL_PROVIDER_ROW_ID}`)
  })

  it('appends the managed row after user rows, preserving them byte-exact', () => {
    const fx = fixture()
    const userYaml = [
      '# user layer',
      '- id: session-telemetry-otel',
      '  disabled: true',
      '- id: skill-badge',
      '  config:',
      '    providerName: \'my-badge\'',
      '',
    ].join('\n')
    writeFileSync(patchPath(fx), userYaml)
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('written')
    const text = readPatch(fx)
    // 用户行(含 !!js 表达式可能出现的行)逐字节保留,受管行追加其后。
    expect(text.startsWith('# user layer\n- id: session-telemetry-otel\n  disabled: true\n')).toBe(true)
    expect(text.indexOf('- id: session-telemetry-otel')).toBeLessThan(text.indexOf(`- id: ${SKILL_PROVIDER_ROW_ID}`))
    expect(text).toContain(`- '${fx.skillRoot}'`)
  })

  it('second boot over its own output is clean: zero rewrite, marker untouched', () => {
    const fx = fixture()
    syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    const afterFirst = readPatch(fx)
    const markerFirst = readFileSync(join(fx.profileDir, SKILL_DIRS_MARKER_FILENAME), 'utf8')
    const second = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(second.status).toBe('clean')
    expect(second.changes).toEqual([])
    expect(readPatch(fx)).toBe(afterFirst)
    expect(readFileSync(join(fx.profileDir, SKILL_DIRS_MARKER_FILENAME), 'utf8')).toBe(markerFirst)
  })

  it('dedup: an existing skill root entry plus user entries stays byte-identical (clean)', () => {
    const fx = fixture()
    const userDir = join(fx.profileDir, 'my-skills')
    const yaml = [
      '- id: skill-filesystem',
      '  config:',
      '    customSkillDirs:',
      `      - '${userDir}'`,
      `      - '${fx.skillRoot}'`,
      '',
    ].join('\n')
    writeFileSync(patchPath(fx), yaml)
    syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir }) // marker boot
    const second = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(second.status).toBe('clean')
    // 用户目录项原样保留(不破坏用户既有其他目录项)+ 技能根恰一条。
    expect(readPatch(fx)).toBe(yaml)
  })
})

// ---------------------------------------------------------------------------
// AC2/AC4:漂移重写 + 升级路径
// ---------------------------------------------------------------------------

describe('task 5.7 syncSkillDirs — drift repair (AC2/AC4)', () => {
  it('re-adds the entry after the user removed it (user entries intact)', () => {
    const fx = fixture()
    const userDir = join(fx.profileDir, 'my-skills')
    syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    writeFileSync(patchPath(fx), [
      '- id: skill-filesystem',
      '  config:',
      '    customSkillDirs:',
      `      - '${userDir}'`,
      '',
    ].join('\n'))
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('repaired')
    const text = readPatch(fx)
    expect(text).toContain(`- '${userDir}'`)
    expect(text).toContain(`- '${fx.skillRoot}'`)
    expect(text.match(new RegExp(`- '${fx.skillRoot.replace(/\\/gu, '\\\\')}'`, 'gu'))?.length).toBe(1)
  })

  it('upgrade path: stale app-managed entry replaced by the new install path (old cleaned)', () => {
    const fx = fixture()
    const staleRoot = join(fx.profileDir, 'node_modules', '@dsh-forge', 'plugin-forge-workbench-old', 'resources', 'skills')
    writeFileSync(patchPath(fx), [
      '- id: skill-filesystem',
      '  config:',
      '    customSkillDirs:',
      `      - '${staleRoot}'`,
      '',
    ].join('\n'))
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('repaired')
    expect(result.changes.some(change => change.includes('stale app-managed entry removed'))).toBe(true)
    const text = readPatch(fx)
    expect(text).not.toContain(staleRoot)
    expect(text).toContain(`- '${fx.skillRoot}'`)
  })

  it('duplicate skill-root entries collapse to exactly one', () => {
    const fx = fixture()
    writeFileSync(patchPath(fx), [
      '- id: skill-filesystem',
      '  config:',
      '    customSkillDirs:',
      `      - '${fx.skillRoot}'`,
      `      - '${fx.skillRoot}'`,
      '',
    ].join('\n'))
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('repaired')
    const text = readPatch(fx)
    expect((text.match(/- '.*skills'/gu) ?? []).length).toBe(1)
  })

  it('manifest hash drift (skill content modified) → repaired + marker refreshed', () => {
    const fx = fixture()
    syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    const before = readSkillDirsMarker(fx.profileDir)?.plugins[PLUGIN_NAME]?.manifestHash
    writeFileSync(join(fx.skillRoot, 'git-commit', 'SKILL.md'), '---\nname: git-commit\ndescription: changed\n---\n\nbody v2\n')
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('repaired')
    expect(result.changes.some(change => change.includes('marker'))).toBe(true)
    const after = readSkillDirsMarker(fx.profileDir)?.plugins[PLUGIN_NAME]?.manifestHash
    expect(after).not.toBe(before)
    expect(after).toBe(computeSkillManifestHash(fx.skillRoot))
  })

  it('a foreign comment inside the file survives a repair byte-exact', () => {
    const fx = fixture()
    syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    const withComment = readPatch(fx).replace(
      '    customSkillDirs:\n',
      '    customSkillDirs:\n      # user note: keep my dirs\n',
    )
    writeFileSync(patchPath(fx), withComment)
    // The comment terminates the surgical entry region (conservative) and the
    // root entry sits before it — a clean boot leaves the file untouched.
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('clean')
    expect(readPatch(fx)).toBe(withComment)
  })
})

// ---------------------------------------------------------------------------
// AC3:前缀校验(T3 注入拒绝)+ 告警矩阵(失败显式不静默)
// ---------------------------------------------------------------------------

describe('task 5.7 syncSkillDirs — prefix guard & alert matrix (AC3/Hard Rules)', () => {
  it('rejects a skill root outside the plugin install directory (T3) — nothing written', () => {
    const fx = fixture()
    const outsideDir = mkdtempSync(join(tmpdir(), 'dsh-forge-outside-'))
    try {
      const outsideRoot = join(outsideDir, 'resources', 'skills')
      mkdirSync(join(outsideRoot, 'submit-task'), { recursive: true })
      writeFileSync(join(outsideRoot, 'submit-task', 'SKILL.md'), '---\nname: submit-task\ndescription: x\n---\n')
      const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: outsideDir })
      expect(result.status).toBe('failed')
      expect(result.alert?.code).toBe('ERR_SKILL_DIR_SYNC')
      expect(result.alert?.message).toContain('T3')
      expect(existsSync(patchPath(fx))).toBe(false)
      expect(existsSync(join(fx.profileDir, SKILL_DIRS_MARKER_FILENAME))).toBe(false)
    } finally {
      rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  it('missing skill root → failed + ERR_SKILL_DIR_SYNC, no config write', () => {
    const fx = fixture([])
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('failed')
    expect(result.alert?.code).toBe('ERR_SKILL_DIR_SYNC')
    expect(result.alert?.message).toContain('missing')
    expect(existsSync(patchPath(fx))).toBe(false)
  })

  it('flow-style customSkillDirs → refused, original file byte-untouched', () => {
    const fx = fixture()
    const hostile = ['- id: skill-filesystem', '  config: { customSkillDirs: [/etc/skills] }', ''].join('\n')
    writeFileSync(patchPath(fx), hostile)
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('failed')
    expect(result.alert?.code).toBe('ERR_SKILL_DIR_SYNC')
    expect(readPatch(fx)).toBe(hostile)
  })

  it('duplicate managed rows → refused (never guesses), file untouched', () => {
    const fx = fixture()
    const hostile = [
      '- id: skill-filesystem',
      '  config:',
      '    customSkillDirs:',
      `      - '${fx.skillRoot}'`,
      '- id: skill-filesystem',
      '  disabled: true',
      '',
    ].join('\n')
    writeFileSync(patchPath(fx), hostile)
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('failed')
    expect(result.alert?.message).toContain('2 rows')
    expect(readPatch(fx)).toBe(hostile)
  })

  it('a non-list patch document → refused, file untouched', () => {
    const fx = fixture()
    const hostile = 'customSkillDirs: yes\n'
    writeFileSync(patchPath(fx), hostile)
    const result = syncSkillDirs({ profileDir: fx.profileDir, pluginDir: fx.pluginDir })
    expect(result.status).toBe('failed')
    expect(readPatch(fx)).toBe(hostile)
  })
})

// ---------------------------------------------------------------------------
// 纯函数面(路径判定 / 条目规划 / 手术编辑)
// ---------------------------------------------------------------------------

describe('isPathInside / installRootOf', () => {
  it('classifies containment with the profile node_modules as the plugin install root', () => {
    const base = resolve(tmpdir(), 'dsh-forge-skilldirs-probe')
    expect(installRootOf(join(base, 'host-profile'))).toBe(resolve(base, 'host-profile', 'node_modules'))
    expect(isPathInside(join(base, 'node_modules', 'a', 'resources', 'skills'), join(base, 'node_modules'))).toBe(true)
    expect(isPathInside(join(base, 'node_modules'), join(base, 'node_modules'))).toBe(true)
    expect(isPathInside(join(base, 'elsewhere', 'skills'), join(base, 'node_modules'))).toBe(false)
    expect(isPathInside(join(base, 'node_modules-evil', 'skills'), join(base, 'node_modules'))).toBe(false)
  })
})

describe('planCustomSkillDirs', () => {
  const root = join('p', 'node_modules', 'a', 'resources', 'skills')
  const install = join('p', 'node_modules')

  it('keeps user entries, drops stale managed ones, dedups the current root', () => {
    const user = join('p', 'my-skills')
    const stale = join('p', 'node_modules', 'a-old', 'resources', 'skills')
    const plan = planCustomSkillDirs([user, stale, root, root], root, install)
    expect(plan.changed).toBe(true)
    expect(plan.currentFirstIndex).toBe(2)
    expect(plan.keptIndices).toEqual([0, 2])
    expect(plan.removedIndices).toEqual([1])
    expect(plan.duplicateIndices).toEqual([3])
  })

  it('marks an append when the current root is absent', () => {
    const plan = planCustomSkillDirs([join('p', 'my-skills')], root, install)
    expect(plan.changed).toBe(true)
    expect(plan.currentFirstIndex).toBe(-1)
    expect(plan.keptIndices).toEqual([0])
  })
})

describe('applySkillDirsToPatchText', () => {
  const root = join('p', 'host-profile', 'node_modules', '@dsh-forge', 'plugin-forge-workbench', 'resources', 'skills')
  const install = join('p', 'host-profile', 'node_modules')

  it('produces a stable idempotent document over its own output', () => {
    const first = applySkillDirsToPatchText(undefined, root, install)
    expect(first.changed).toBe(true)
    const second = applySkillDirsToPatchText(first.text, root, install)
    expect(second.changed).toBe(false)
    expect(second.text).toBe(first.text)
  })

  it('preserves a user !!js expression row byte-exact while appending the managed row', () => {
    const userText = [
      '- id: some-row',
      '  config:',
      "    base: !!js \"process.getBuiltinModule('node:url').fileURLToPath(new URL('x', baseUrl))\"",
      '',
    ].join('\n')
    const edit = applySkillDirsToPatchText(userText, root, install)
    expect(edit.changed).toBe(true)
    expect(edit.text.startsWith(userText.replace(/\n$/u, ''))).toBe(true)
    expect(edit.text).toContain(`- id: ${SKILL_PROVIDER_ROW_ID}`)
  })

  it('refuses flow-style arrays', () => {
    expect(() => applySkillDirsToPatchText('- id: skill-filesystem\n  config:\n    customSkillDirs: [a, b]\n', root, install))
      .toThrow(/flow style/)
  })
})
