// boot manifest 消费（定位：基础）——Integration「boot manifest 掌舵 → dsh-client-web 壳内核」。
// 流程（官方 apps/web 母本模式，desktop 载体形态）：
//   preload 取 {url, injections} → 装 __DSH_TRANSPORT__ carrier → applyIndexInjections
//   按表序执行注入行（官方 ui-* client bundle 由此入页）→ 掌舵：产品 client 插件行追加进
//   __DSH_BOOT__ 组合图（产品插件与官方 ui-* 同门进入 Loader 组合）→ 放行 __DSH_BOOT_READY__ 门
//   （dsh-client-web 壳内核 AppWebEntry.run 在门后读图建模块系统）。
import { applyIndexInjections } from '@deepseek-ai/dsh-client-web'
import { assertBootManifestShape, preloadBridge } from './bridge.js'
import { installTransportCarrier, transportCarrierFor } from './carrier.js'

/** 产品 client 插件的掌舵入图描述（vite 第二入口产物；url 须文档相对 + 带 rev 查询） */
export interface ProductClientEntry {
  /** 插件 id（= 包名；__ModuleLoader__ 注册键与 Loader entry 名） */
  readonly id: string
  /** bundle 文档相对 URL（含 ?rev= 缓存戳——模块系统 atRevision 契约） */
  readonly url: string
  /** 内容修订（缓存戳/HMR 锚） */
  readonly rev: string
}

/** __DSH_BOOT__ 组合图的窄类型（宿主 global 行写入；壳只追加不重排——行序 = 模块图序） */
export interface BootGraphWire {
  entries: { id: string; url: string; rev: string; inject?: string[]; immediately?: boolean }[]
  batches: { phase: 'bootstrap' | 'application'; url: string; rev: string; entries: string[] }[]
}

interface BootGlobals {
  __DSH_BOOT__?: unknown
  __DSH_BOOT_READY__?: BootReadinessGate
}

/** boot 就绪门（injections 全部生效后放行；AppWebEntry.run await 其 promise） */
export interface BootReadinessGate {
  readonly promise: Promise<void>
  resolve(): void
  reject(reason?: unknown): void
}

/** 取/建就绪门（官方 desktop 页由 index 内联脚本预建；此处兜底 ??=，两侧谁先到谁建）。 */
export function bootReadinessGate(): BootReadinessGate {
  const globals = globalThis as BootGlobals
  globals.__DSH_BOOT_READY__ ??= Promise.withResolvers<void>()
  return globals.__DSH_BOOT_READY__
}

/** script-src 注入行的加载器（文档相对 src 解析于页 origin——宿主自定义 scheme 转发到 webserver）。 */
export function loadScriptElement(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => {
      resolve()
    }
    script.onerror = () => {
      reject(new Error(`dsh-forge web: 注入脚本加载失败 ${src}`))
    }
    document.head.append(script)
  })
}

/**
 * 掌舵：产品 client 插件行追加进 __DSH_BOOT__ 组合图（纯追加、原位变更——global 即线上形状）。
 * 追加 entry（immediately: true → stage-one 预取注册工厂）与一条 application 批（该批仅含本行，
 * 不与宿主批混合）；须在 applyIndexInjections 之后（global 行已写 __DSH_BOOT__）、放行就绪门之前
 * （AppWebEntry.run 门后读图）。HMR 全图 sync 会以宿主最新图替换 desired——产品组合静态
 * （打包发版节奏），该残留记入 S2 清单。
 * @param wire - __DSH_BOOT__ 现值（宿主注入的 global 行）
 * @param product - 产品 client 插件入图描述
 * @returns 追加后的同一图对象（原位变更）
 * @throws 图形状非法 / 产品行 id 已在图中（重复掌舵）
 */
export function steerBootGraph(wire: unknown, product: ProductClientEntry): BootGraphWire {
  if (typeof wire !== 'object' || wire === null || !Array.isArray((wire as BootGraphWire).entries)
    || !Array.isArray((wire as BootGraphWire).batches)) {
    throw new Error('dsh-forge web: __DSH_BOOT__ 组合图缺席或形状非法（宿主 global 注入行未生效）')
  }
  const graph = wire as BootGraphWire
  if (graph.entries.some((row) => row.id === product.id) || graph.batches.some((b) => b.url === product.url)) {
    throw new Error(`dsh-forge web: 产品 client 插件行已入图（重复掌舵）：${product.id}`)
  }
  graph.entries.push({ id: product.id, url: product.url, rev: product.rev, inject: [], immediately: true })
  graph.batches.push({ phase: 'application', url: product.url, rev: product.rev, entries: [product.id] })
  return graph
}

/**
 * 壳 boot 消费主流程（main 入口调用；与 AppWebEntry.run 并行——run 在就绪门上等待）。
 * 任一步失败即 reject 就绪门：AppWebEntry.run 的门 await 抛出 → 壳内核 boot 页渲染失败因。
 */
export async function bootShell(product: ProductClientEntry): Promise<void> {
  const gate = bootReadinessGate()
  try {
    const manifest = assertBootManifestShape(await preloadBridge().getBootManifest())
    installTransportCarrier(transportCarrierFor(manifest.url))
    // 注入行形状归 dsh（IndexInjection）；host 只运输，壳按表执行（applyIndexInjections 校验行 kind）
    await applyIndexInjections(manifest.injections as Parameters<typeof applyIndexInjections>[0], loadScriptElement)
    steerBootGraph((globalThis as BootGlobals).__DSH_BOOT__, product)
    gate.resolve()
  } catch (error) {
    gate.reject(error)
    throw error
  }
}
