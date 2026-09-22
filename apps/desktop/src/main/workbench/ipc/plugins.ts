// workbench/ipc/plugins — 插件管理面(listPlugins / setPluginEnabled 的服务
// 装配,任务 2.7 桩形态;tech-design §Interface 4)。
//
// 两级模型的运行时投影:
//   - PluginRow.mandatory 派生自产品清单(plugin-bundles.json 条目
//     `mandatory: true`;清单为构建期产物,运行时零写入——本模块对清单只读);
//   - enabled 派生自 userData 覆盖文件 `<userData>/plugin-runtime.json`
//     (schema 仅 `{ disabled: string[] }`);文件缺失 = 空覆盖 = 全启用;
//   - 覆盖文件解析即校验(T5 缓解):出现在 disabled 内的 mandatory 名或
//     未知名一律剔除 + ERR_PLUGIN_RUNTIME_STATE log,插件区显示清单态。
//
// setPluginEnabled 的守卫为依赖注入缝(任务 2.7 桩 → 3.1 真守卫替换):
// 桩 = 对清单标注 mandatory 的名字恒抛 ERR_PLUGIN_MANDATORY;3.1 落地后由
// host-profile 守卫(含「仅第三方可写覆盖文件」的完整语义)在装配处替换,
// 本文件的服务装配不动。成功路径只写 userData 覆盖文件(清单字节不变)。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { shellLog } from '../../log.ts'
import type { PluginRow } from './types.ts'

/** 结构化 log 最小面(测试注入)。 */
type PluginLog = Pick<typeof shellLog, 'warn'>

/**
 * 3.1 接线缝:setPluginEnabled 的单写路径守卫。实现方对「必须保持启用」的
 * bundle 名抛携带 `code = ERR_PLUGIN_MANDATORY` 的错误;放行则正常返回。
 */
export interface PluginEnableGuard {
  assertCanBeDisabled(bundleName: string): void
}

/** mandatory 插件禁用请求(纵深第二层;错误封装映射按 `code` 识别)。 */
export class PluginMandatoryError extends Error {
  readonly code = 'ERR_PLUGIN_MANDATORY'

  constructor(message: string) {
    super(message)
    this.name = 'PluginMandatoryError'
  }
}

/** 清单条目的本模块投影(宽松读取:mandatory 字段缺失 = 非必备)。 */
export interface PluginManifestBundle {
  readonly name: string
  readonly mandatory: boolean
}

/**
 * 读取产品清单的 bundle 投影。宽松于 host-profile 的严格校验(mandatory
 * 字段是 3.1 才落入清单约定的键,此处先容忍读取):结构损坏(缺文件/坏
 * JSON/非对象 bundles)仍然失败上抛 —— 插件清单没有第二事实源。
 */
export function readPluginManifestBundles(manifestPath: string): PluginManifestBundle[] {
  let raw: string
  try {
    raw = readFileSync(manifestPath, 'utf8')
  } catch {
    throw new Error(`plugin bundles manifest not found at ${manifestPath}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`plugin bundles manifest ${manifestPath} is not valid JSON (${String(error)})`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`plugin bundles manifest ${manifestPath} must hold a JSON object`)
  }
  const bundles = (parsed as { bundles?: unknown }).bundles
  if (!Array.isArray(bundles)) {
    throw new Error(`plugin bundles manifest ${manifestPath} has no bundles array`)
  }
  return bundles.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`plugin bundles manifest ${manifestPath} has a non-object bundle entry`)
    }
    const name = (entry as { name?: unknown }).name
    if (typeof name !== 'string' || name === '') {
      throw new Error(`plugin bundles manifest ${manifestPath} has a bundle entry without a valid name`)
    }
    return { name, mandatory: (entry as { mandatory?: unknown }).mandatory === true }
  })
}

/**
 * 2.7 桩守卫:清单标注 mandatory 的名字恒拒(PluginMandatoryError)。3.1
 * 完成后在装配处以 host-profile 真守卫替换(接口不变,本实现退役)。
 */
export function createStubPluginEnableGuard(loadBundles: () => readonly PluginManifestBundle[]): PluginEnableGuard {
  return {
    assertCanBeDisabled(bundleName: string): void {
      const entry = loadBundles().find(bundle => bundle.name === bundleName)
      if (entry?.mandatory === true) {
        throw new PluginMandatoryError(`plugin ${bundleName} is mandatory and cannot be disabled`)
      }
    },
  }
}

/** 覆盖文件解析产物:经「解析即校验」剔除违规条目后的 disabled 名集。 */
interface EffectiveOverlay {
  readonly disabled: ReadonlySet<string>
  /** 被剔除的违规条目(mandatory 名 / 未知名 / 非字符串项),log 用。 */
  readonly violations: readonly string[]
}

/** 覆盖文件读取(防御读):缺失 = 空覆盖;损坏 JSON = log + 空覆盖(3.1 落隔离重建)。 */
function readOverlay(overlayPath: string, manifest: readonly PluginManifestBundle[], log: PluginLog): EffectiveOverlay {
  if (!existsSync(overlayPath)) return { disabled: new Set(), violations: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(overlayPath, 'utf8'))
  } catch (error) {
    log.warn({
      code: 'ERR_PLUGIN_RUNTIME_STATE',
      message: 'plugin runtime overlay is not valid JSON — falling back to the manifest state',
      data: { overlayPath, detail: String(error) },
    })
    return { disabled: new Set(), violations: [] }
  }
  const disabled = (parsed as { disabled?: unknown }).disabled
  if (!Array.isArray(disabled)) {
    log.warn({
      code: 'ERR_PLUGIN_RUNTIME_STATE',
      message: 'plugin runtime overlay has no disabled array — falling back to the manifest state',
      data: { overlayPath },
    })
    return { disabled: new Set(), violations: [] }
  }
  const known = new Map(manifest.map(bundle => [bundle.name, bundle.mandatory]))
  const kept = new Set<string>()
  const violations: string[] = []
  for (const entry of disabled) {
    if (typeof entry !== 'string') {
      violations.push(String(entry))
      continue
    }
    const mandatory = known.get(entry)
    if (mandatory === undefined || mandatory) {
      violations.push(entry)
      continue
    }
    kept.add(entry)
  }
  if (violations.length > 0) {
    log.warn({
      code: 'ERR_PLUGIN_RUNTIME_STATE',
      message: 'plugin runtime overlay carried mandatory or unknown entries — stripped (manifest state wins)',
      data: { overlayPath, violations: [...violations] },
    })
  }
  return { disabled: kept, violations }
}

/** 覆盖文件写入(schema 仅 `{ disabled: string[] }`;目录按需创建)。 */
function writeOverlay(overlayPath: string, disabled: ReadonlySet<string>): void {
  mkdirSync(dirname(overlayPath), { recursive: true })
  writeFileSync(overlayPath, `${JSON.stringify({ disabled: [...disabled].sort() }, null, 2)}\n`)
}

/** 插件面服务装配(manifest 只读 + 覆盖文件读写 + 守卫注入)。 */
export interface PluginFaceDeps {
  /** 产品清单路径(apps/desktop/resources/plugin-bundles.json,运行时只读)。 */
  readonly manifestPath: string
  /** userData 覆盖文件路径(<userData>/plugin-runtime.json)。 */
  readonly overlayPath: string
  /** 3.1 接线缝:setPluginEnabled 单写路径守卫。 */
  readonly guard: PluginEnableGuard
  readonly log?: PluginLog
}

export interface PluginFace {
  /** 清单 × 覆盖文件的 PluginRow 投影(listPlugins 动词的服务实现)。 */
  listRows(): PluginRow[]
  /**
   * 启停(守卫先行):mandatory → ERR_PLUGIN_MANDATORY;未知名 → 契约错误;
   * 成功只写覆盖文件(清单字节不变),返回写入后的 PluginRow[]。
   */
  setEnabled(name: string, enabled: boolean): PluginRow[]
}

export function createPluginFace(deps: PluginFaceDeps): PluginFace {
  const log = deps.log ?? shellLog
  return {
    listRows(): PluginRow[] {
      const manifest = readPluginManifestBundles(deps.manifestPath)
      const overlay = readOverlay(deps.overlayPath, manifest, log)
      return manifest.map(bundle => ({ name: bundle.name, mandatory: bundle.mandatory, enabled: !overlay.disabled.has(bundle.name) }))
    },
    setEnabled(name: string, enabled: boolean): PluginRow[] {
      deps.guard.assertCanBeDisabled(name)
      const manifest = readPluginManifestBundles(deps.manifestPath)
      if (!manifest.some(bundle => bundle.name === name)) {
        throw new Error(`unknown plugin name ${name} — the product manifest has no such bundle`)
      }
      const overlay = readOverlay(deps.overlayPath, manifest, log)
      const next = new Set(overlay.disabled)
      if (enabled) next.delete(name)
      else next.add(name)
      writeOverlay(deps.overlayPath, next)
      return manifest.map(bundle => ({ name: bundle.name, mandatory: bundle.mandatory, enabled: !next.has(bundle.name) }))
    },
  }
}
