// boot manifest 形状（G1 契约面清单第 1 项：`{url, injections}` 注入格式；定位：基础）。
// injections 行形状归 dsh（dsh-host-webserver IndexInjection——style/script 等），
// host 只运输不解释；apps/web 壳内核（1.5）以 applyIndexInjections 同形消费。
export interface BootManifest {
  /** 已认证 web 面 URL（ctx.connection.authenticatedUrl 构造） */
  url: string
  /** 官方 ui-* client bundle 与产品插件注入行（ctx.webServer.collectIndexInjections 原样） */
  injections: readonly unknown[]
}

/** 组装 boot manifest（纯函数：校验 url/injections 基本形状后冻结返回） */
export function buildBootManifest(url: string, injections: readonly unknown[]): BootManifest {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    throw new Error(`[host:boot] manifest.url 须为 http(s) URL，实得：${String(url)}`)
  }
  if (!Array.isArray(injections)) {
    throw new Error('[host:boot] manifest.injections 须为数组（collectIndexInjections 原样）')
  }
  return Object.freeze({ url, injections: Object.freeze([...injections]) })
}
