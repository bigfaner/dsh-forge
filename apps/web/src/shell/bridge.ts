// preload 桥（定位：基础）——{url, injections} boot manifest 的 renderer 侧读取面。
// 形状权威 = apps/host/src/boot/manifest.ts（BootManifest，G1 契约面清单第 1 项）；
// 暴露面 = apps/host/src/ipc/preload.mts 的 window.dshForge.getBootManifest()（唯一暴露面）。
// 本模块只做形状声明与 fail-loud 读取，不解释 injections 行（行形状归 dsh，壳按表执行）。

/** 宿主组装的 boot manifest（IPC 序列化后形态；G1 第 1 项缝） */
export interface BootManifestPayload {
  /** 已认证 web 面 URL（ctx.connection.authenticatedUrl 构造） */
  readonly url: string
  /** 官方 ui-* client bundle 注入行 + 组合图（collectIndexInjections 原样） */
  readonly injections: readonly unknown[]
}

/** apps/host ESM preload 暴露面（window.dshForge） */
export interface DshForgePreloadGlobal {
  getBootManifest(): Promise<BootManifestPayload>
}

interface WindowWithPreload {
  dshForge?: DshForgePreloadGlobal
}

/** 读取 preload 暴露面；缺席即装配断裂（host 未接 preload / 非 Electron 载体），fail-loud。 */
export function preloadBridge(): DshForgePreloadGlobal {
  const bridge = (globalThis as WindowWithPreload).dshForge
  if (bridge === undefined || typeof bridge.getBootManifest !== 'function') {
    throw new Error('dsh-forge web: window.dshForge.getBootManifest 缺席——宿主 preload 未接入（boot manifest 通道 = dsh-forge:boot）')
  }
  return bridge
}

/** 校验 manifest 基本形状（url 须 http(s)；injections 须数组）——与 host buildBootManifest 同律。 */
export function assertBootManifestShape(manifest: BootManifestPayload): BootManifestPayload {
  if (typeof manifest.url !== 'string' || !/^https?:\/\//.test(manifest.url)) {
    throw new Error(`dsh-forge web: manifest.url 须为 http(s) URL，实得：${String(manifest.url)}`)
  }
  if (!Array.isArray(manifest.injections)) {
    throw new Error('dsh-forge web: manifest.injections 须为数组（collectIndexInjections 原样）')
  }
  return manifest
}
