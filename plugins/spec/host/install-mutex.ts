// INV-3 安装互斥 loud-fail 守卫（bug ef3e92ea——forge-aggregate-bundle 1.32）：
// 对侧 forge 聚合 bundle 已激活（组合标记服务在场现查——AGENTS §1.6 三铁律：调用期
// 求值、零缓存、异常视同缺席）而本行缺 bundle 组合标记（comboMark 缺席 = solo patch
// 行越装——bundle 六插行与 solo patch 行同 id 键合并整行替换，裸 config 越装激活）
// → throw loud-fail，不静默共存。forge 侧对偶守卫见 plugins/forge/host/index.ts。

/** forge 组合标记服务键（forge apply 激活期 provide——与 plugins/forge/host/assembly.ts
 *  FORGE_COMBO_SERVICE_KEY 同值单源：跨包零 import（no-cross-plugin-imports 红线），
 *  契约 pin 归 plugins/forge/tests/install-mutex.test.ts 双侧对账，漂移即红）。 */
export const FORGE_COMBO_SERVICE_KEY = "forgeCombo";

/** launcher 供服 profileContext 服务键（官方 @deepseek-ai/cordis Context 声明——Path B
 *  startedBundles 名单现查；forge patch !!js 表达式同键先例 `ctx.get('profileContext')`） */
export const PROFILE_CONTEXT_SERVICE_KEY = "profileContext";

/** forge 聚合 bundle 包名（Path B 名单比对锚——与 plugins/forge/package.json name 同值单源） */
export const FORGE_PKG = "@dsh-forge/forge";

/** 安装互斥守卫消费的 config 面（成员 HostConfig 以 comboMark 字段结构兼容） */
export interface InstallMutexConfigFace {
  /** bundle 六插行组合装载标记（forge patch 成员行下发 comboMark: true——solo patch 行越装缺此键） */
  readonly comboMark?: boolean;
}

/**
 * 安装互斥守卫（成员 apply 激活期首查——任何装配副作用之前）。
 *
 * 双判据（launcher 层序官方语义——后应用层整行替换同 id 行，README.zh「后应用的层优先」）：
 * ① Path A（bundle 先装、solo 后装）：solo 层在后 → solo 裸行整行替换 bundle comboMark
 *    行 → comboMark 缺席 + forge 组合标记在场 → throw；
 * ② Path B（solo 先装、bundle 后装）：bundle 层在后 → comboMark 行获胜，①失效——
 *    改判据 = profileContext.startedBundles 名单同时含 forge 与本包（solo bundle 仍以
 *    独立 bundle 名单在场）→ throw（官方面核销 packages/boot/app-boot profile-context.ts
 *    ProfileContext.startedBundles——启动期 bundles 名单快照，dsh launcher 供服）。
 * @param ctx 宿主 ctx（reflect 现查组合标记服务 + profileContext 名单）
 * @param config 插件行 config（comboMark 在场 = bundle 组合装载行获胜）
 * @param member 本包名（冲突报文指名 + Path B 名单比对锚）
 */
export function assertInstallMutex(ctx: unknown, config: InstallMutexConfigFace | undefined, member: string): void {
  let present = false;
  try {
    const reflect = (ctx as { reflect?: { get?(name: string): unknown } }).reflect;
    present = reflect?.get?.(FORGE_COMBO_SERVICE_KEY) != null;
  } catch {
    present = false; // 反射异常视同缺席（fail-soft——检测不阻载正常激活）
  }
  if (!present) return; // forge 缺席（solo 正常单装）——放行
  if (config?.comboMark !== true) {
    throw conflictError(member, "solo patch 裸行越装（bundle comboMark 组合标记缺席）");
  }
  if (soloBundleCoInstalled(ctx, member)) {
    throw conflictError(member, "solo bundle 仍在 profile bundles 名单在场（后装 bundle 层行获胜形态）");
  }
}

/** 冲突 loud-fail 报文（INV-3 指名——可见失败非静默共存） */
function conflictError(member: string, why: string): Error {
  return new Error(
    `[INV-3] 安装互斥冲突：forge 聚合 bundle 已激活（组合标记服务 ${FORGE_COMBO_SERVICE_KEY} 在场），` +
      `${member} 不得经 solo 通道越装（${why}）——请卸载 solo 包或改用 forge 聚合 bundle 通道`,
  );
}

/** Path B 判据（launcher 供服 profileContext 现查——缺席/劣形 = 未检出，fail-soft 放行） */
function soloBundleCoInstalled(ctx: unknown, member: string): boolean {
  try {
    const reflect = (ctx as { reflect?: { get?(name: string): unknown } }).reflect;
    const raw = reflect?.get?.(PROFILE_CONTEXT_SERVICE_KEY) as { startedBundles?: readonly string[] } | undefined;
    const list = raw?.startedBundles;
    if (!Array.isArray(list)) return false;
    return list.includes(FORGE_PKG) && list.includes(member);
  } catch {
    return false;
  }
}
