// 预设底稿装载（M3 3.7；定位：基础）——apps/host/src/profile/presets/ 三 patch 底稿的
// 运行期读取面，供 boot overlay 每启注行（renderBootOverlay 物化分叉的文件侧）。
// 底稿 = 产品工件（cordis = registry 覆写行；expedition/blitz = 上游 standard 全量镜像
// + 产品分叉——契约 pin 见 presets.test.ts 机械 diff）。行所有权分叉（tech-design 边界 3）：
// 预设行 = boot overlay 每启覆盖（用户不可经 UI 改组合）；ui-settings 开关行 = 首启预置
// 一次性让位用户（template.ts/materialize.ts 面）——两径不混，本模块只涉前者。
// 目录解析双锚：模块同邻 presets/（vitest src 直读；构建拷贝形态 = dist/profile/presets/
// ——scripts/copy-preset-assets.mjs 随 pnpm build 落位，assemble host-dist 递归随包）→
// repo 回退 hostRoot()/src/profile/presets（dev electron 形态：tsc 不拷贝非 TS 资产，
// dist 邻位缺席而 repo src 在场）。两锚皆缺席（如打包形态未 stage）= undefined fail-soft
// （预设面降级不抛断 boot——装配缺口由结构 pin/冒烟显形，同 paths.ts skillsDir 纪律）。
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { hostRoot } from './paths.js'

/** 底稿种类（cordis = registry 覆写；expedition/blitz = 预设行） */
export type PresetPatchKind = 'cordis' | 'expedition' | 'blitz'

/** 三底稿文件名（apps/host/src/profile/presets/） */
export const PRESET_PATCH_FILE_NAMES: Readonly<Record<PresetPatchKind, string>> = {
  cordis: 'cordis.patch.yml',
  expedition: 'expedition.patch.yml',
  blitz: 'blitz.patch.yml',
}

/** 三底稿全文（未物化——customSkillDirs 占位符/平台门 !!js 原样，物化在 overlay.ts） */
export interface PresetPatches {
  /** registry 覆写行（agent-preset-registry default = expedition）——零物化直入 */
  readonly cordis: string
  /** 远征预设行（镜像 + [core,spec] 技能目录占位符 + spec 增量行） */
  readonly expedition: string
  /** 突击预设行（镜像 − spec 目录 − spec 增量行） */
  readonly blitz: string
}

/** 底稿目录解析（双锚：模块同邻 → repo src 回退；皆缺席 = undefined） */
export function resolvePresetPatchDir(moduleUrl: string): string | undefined {
  const sibling = fileURLToPath(new URL('./presets', moduleUrl))
  if (existsSync(join(sibling, PRESET_PATCH_FILE_NAMES.cordis))) return sibling
  const repo = join(hostRoot(), 'src', 'profile', 'presets')
  return existsSync(join(repo, PRESET_PATCH_FILE_NAMES.cordis)) ? repo : undefined
}

/**
 * 装载三底稿（all-or-nothing：任一缺席 = undefined 整体降级——三件随产品组合分发，
 * 半套注行 = registry 指向缺席预设/菜单单预设等错配形态，不部分上场）。
 */
export function loadPresetPatches(moduleUrl: string = import.meta.url): PresetPatches | undefined {
  const dir = resolvePresetPatchDir(moduleUrl)
  if (dir === undefined) {
    console.warn('[presets] 底稿目录缺席（预设面降级——hero 座位不上场；打包形态未 stage？）')
    return undefined
  }
  const read = (kind: PresetPatchKind): string => readFileSync(join(dir, PRESET_PATCH_FILE_NAMES[kind]), 'utf8')
  try {
    return { cordis: read('cordis'), expedition: read('expedition'), blitz: read('blitz') }
  } catch (error) {
    console.warn(`[presets] 底稿读取失败（预设面降级）：${String((error as Error)?.message ?? error)}`)
    return undefined
  }
}
