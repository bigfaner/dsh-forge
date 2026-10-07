// profile 首启落地（定位：基础）。幂等铁律：已存在的文件一律不重写——
// cordis.patch.yml 是用户层状态，重写即破坏「插件升级 = 随应用发版更新资源目录」约定。
// M3 3.7 增量补行：ui-settings 开关行（hero 预设座位显示开关）id 键控补写——老用户
// 升级补写、已存在不覆盖（此后归用户运行时，设置 UI 保存不被拒）；与文件级幂等分层
//（文件不重写 ≠ 行不补——补行只在行缺席时发生，写后行在场即稳态）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PROFILE_ROOT_BOOTSTRAP, PROFILE_TEMPLATE_FILES, UI_SETTINGS_PRESET_ROW } from './template.js'

export interface MaterializeResult {
  dir: string
  /** 本次实际写入的文件名（首启 = 全量；重复启动 = 空） */
  created: string[]
  /** 已存在而保持不动的文件名（幂等不重写） */
  kept: string[]
  /** 增量补行落位的文件名（M3 3.7：ui-settings 开关行——老用户升级补写；行在场 = 空） */
  patched: string[]
}

/** cordis.patch.yml 内是否已有 ui-settings 行（id 键控——顶层级行锚；insert 块内行缩进不匹配） */
function hasUiSettingsRow(patchText: string): boolean {
  return /^-\s+id:\s*ui-settings\s*$/m.test(patchText)
}

/**
 * 首启将 profile 模板落地 profileDir（tech-design「profile 组装与插件分发」）。
 * 写入集 = 模板三件（package.json / cordis.patch.yml / pnpm-workspace.yaml）
 * + cordis.yml 空根兜底（boot 拥有：runProfile 每启重写，此处仅保证 Loader 有真实根锚定）。
 * node_modules 不在本函数职责：packaged 形态随应用资源分发（4.1 extraResources）。
 */
export function ensureProfileMaterialized(profileDir: string): MaterializeResult {
  const files: Record<string, string> = {
    ...PROFILE_TEMPLATE_FILES,
    [PROFILE_ROOT_BOOTSTRAP.name]: PROFILE_ROOT_BOOTSTRAP.content,
  }
  const created: string[] = []
  const kept: string[] = []
  const patched: string[] = []
  for (const [name, content] of Object.entries(files)) {
    const path = join(profileDir, name)
    if (existsSync(path)) {
      kept.push(name)
      continue
    }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
    created.push(name)
  }
  // 增量补行（3.7）：已落地的 cordis.patch.yml 缺 ui-settings 行 → 补写（首启落地者
  // 模板自带本行——本径实际服务老用户升级；行在场（含用户自写/已改值）一律不动）
  const patchPath = join(profileDir, 'cordis.patch.yml')
  if (!created.includes('cordis.patch.yml') && existsSync(patchPath)) {
    const text = readFileSync(patchPath, 'utf8')
    if (!hasUiSettingsRow(text)) {
      writeFileSync(patchPath, `${text.endsWith('\n') || text === '' ? text : `${text}\n`}${UI_SETTINGS_PRESET_ROW}\n`, 'utf8')
      patched.push('cordis.patch.yml')
    }
  }
  return { dir: profileDir, created, kept, patched }
}
