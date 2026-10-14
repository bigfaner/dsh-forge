// boot manifest 形状（G1 契约面清单第 1 项：`{url, injections}` 注入格式；定位：基础）。
// injections 行形状归 dsh（dsh-host-webserver IndexInjection——style/script 等），
// host 只运输不解释；apps/web 壳内核（1.5）以 applyIndexInjections 同形消费。
export interface BootManifest {
  /** 已认证 web 面 URL（ctx.connection.authenticatedUrl 构造） */
  url: string
  /** 官方 ui-* client bundle 与产品插件注入行（ctx.webServer.collectIndexInjections 原样） */
  injections: readonly unknown[]
  /** fix-3：webserver 实际绑定 host（'127.0.0.1' | '0.0.0.0'——UI 远程 pending/listening
   *  判读单源；可选：旧 child / 读取降级 = 缺席） */
  remoteHost?: string
  /** fix-5：官方配对/连接地址（fix-6 起产 `http://<lan-ip>:<port>/pair?token=<token>` 形状
   *  ——手机扫码经 /pair 握手换官方会话 cookie；UI QR/地址行单源消费；可选：回环绑定 /
   *  无局域网 IPv4 / 旧 child = 缺席） */
  remotePairUrl?: string
  /** fix-6：配对令牌到期时刻（epoch ms——桌面 QR 倒计时单源；与 remotePairUrl 同生同灭） */
  remotePairExpiresAt?: number
}

/** 网卡读数窄面（node:os networkInterfaces 值元结构——纯函数零 node 依赖） */
export interface NetInterfaceRead {
  readonly family: unknown
  readonly address: string
  readonly internal: boolean
}

/**
 * fix-5 官方配对地址宿主选址（纯函数）：首个非回环 IPv4（排除 link-local 169.254.*）；
 * 无 = undefined（remotePairUrl 缺席——UI 空态回退，不自造地址）。
 */
export function lanIpv4Of(interfaces: readonly (readonly NetInterfaceRead[] | undefined)[]): string | undefined {
  for (const list of interfaces) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) return net.address
    }
  }
  return undefined
}

/**
 * fix-6 官方 /pair 配对地址形状（纯函数——URL 形状单源，官方 :1489 同构）：
 * `http://<lan-ip>:<port>/pair?token=<token>`。手机扫码 GET 该地址 → /pair 缝恒时校验
 * 后 302 官方认证 URL（BrowserAuth 铸 HttpOnly SameSite=Strict 会话 cookie——官方
 * dsh_mobile 同语义）。
 */
export function remotePairUrlOf(lanIpv4: string, port: number, token: string): string {
  return `http://${lanIpv4}:${port}/pair?token=${token}`
}

/** 组装 boot manifest（纯函数：校验 url/injections 基本形状后冻结返回） */
export function buildBootManifest(
  url: string,
  injections: readonly unknown[],
  remoteHost?: string,
  remotePairUrl?: string,
  remotePairExpiresAt?: number,
): BootManifest {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    throw new Error(`[host:boot] manifest.url 须为 http(s) URL，实得：${String(url)}`)
  }
  if (!Array.isArray(injections)) {
    throw new Error('[host:boot] manifest.injections 须为数组（collectIndexInjections 原样）')
  }
  return Object.freeze({
    url,
    injections: Object.freeze([...injections]),
    ...(typeof remoteHost === 'string' && remoteHost !== '' ? { remoteHost } : {}),
    ...(typeof remotePairUrl === 'string' && remotePairUrl !== '' ? { remotePairUrl } : {}),
    ...(typeof remotePairExpiresAt === 'number' && Number.isFinite(remotePairExpiresAt) && remotePairExpiresAt > 0
      ? { remotePairExpiresAt }
      : {}),
  })
}
