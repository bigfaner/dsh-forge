// workbench/ipc/plugins — 插件管理面(listPlugins / setPluginEnabled 的服务
// 装配,任务 2.7 建面、3.1 接真守卫;tech-design §Interface 4)。
//
// 两级模型的运行时投影:
//   - PluginRow.mandatory 派生自产品清单(plugin-bundles.json 条目
//     `mandatory: true`;清单为构建期产物,运行时零写入——本模块对清单只读);
//   - enabled 派生自 userData 覆盖文件 `<userData>/plugin-runtime.json`
//     (schema 仅 `{ disabled: string[] }`);文件缺失 = 空覆盖 = 全启用。
//
// 任务 3.1 起,覆盖文件读写与守卫下沉至 plugin-runtime 域模块
// (../plugin-runtime/overlay.ts 唯一写实现 + guard.ts 真守卫):
//   - 解析即校验(T5 缓解)在 overlay 读取内完成——畸形文件隔离重建
//     (ERR_PLUGIN_RUNTIME_STATE + `<name>.corrupt-<ts>`),违规条目
//     (mandatory 名/未知名)剔除 + log,插件区显示清单态;
//   - setPluginEnabled 的守卫经依赖注入缝接真守卫(mandatory →
//     ERR_PLUGIN_MANDATORY;仅第三方可写入覆盖文件)。成功路径只写
//     userData 覆盖文件(清单字节不变)。

import { readFileSync } from 'node:fs'
import { readPluginRuntimeOverlay, writePluginRuntimeOverlay } from '../../plugin-runtime/overlay.ts'
import { shellLog } from '../../log.ts'
import type { PluginEnableGuard } from '../../plugin-runtime/guard.ts'
import type { PluginRow } from './types.ts'

// 2.7 缝契约原位再导出(services/测试既有导入路径不变;实现已移驻
// plugin-runtime/guard.ts,2.7 桩守卫随之退役)。
export { PluginMandatoryError } from '../../plugin-runtime/guard.ts'
export type { PluginEnableGuard } from '../../plugin-runtime/guard.ts'

/** 结构化 log 最小面(测试注入)。 */
type PluginLog = Pick<typeof shellLog, 'warn'>

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

/** 插件面服务装配(manifest 只读 + 覆盖文件读写 + 守卫注入)。 */
export interface PluginFaceDeps {
  /** 产品清单路径(apps/desktop/resources/plugin-bundles.json,运行时只读)。 */
  readonly manifestPath: string
  /** userData 覆盖文件路径(<userData>/plugin-runtime.json)。 */
  readonly overlayPath: string
  /** setPluginEnabled 单写路径守卫(3.1 真守卫;测试可注入)。 */
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
      const overlay = readPluginRuntimeOverlay(deps.overlayPath, manifest, log)
      return manifest.map(bundle => ({ name: bundle.name, mandatory: bundle.mandatory, enabled: !overlay.disabled.has(bundle.name) }))
    },
    setEnabled(name: string, enabled: boolean): PluginRow[] {
      deps.guard.assertCanBeDisabled(name)
      const manifest = readPluginManifestBundles(deps.manifestPath)
      if (!manifest.some(bundle => bundle.name === name)) {
        throw new Error(`unknown plugin name ${name} — the product manifest has no such bundle`)
      }
      const overlay = readPluginRuntimeOverlay(deps.overlayPath, manifest, log)
      const next = new Set(overlay.disabled)
      if (enabled) next.delete(name)
      else next.add(name)
      writePluginRuntimeOverlay(deps.overlayPath, next)
      return manifest.map(bundle => ({ name: bundle.name, mandatory: bundle.mandatory, enabled: !next.has(bundle.name) }))
    },
  }
}
