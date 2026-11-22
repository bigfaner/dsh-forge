// @dsh-forge/forge host 入口（forge-aggregate-bundle 1.6 薄化）：
// 聚合 Bundle 主通道下五件经 patch 六插行激活（官方默认路径——依赖落盘后插行激活
// 天然成立），COMPOSED 组合段与 typert 手工缝解引用退役（组合/派发归 patch !!js 行，
// assembly.ts 只余在场守卫具名服务键与 config 类型；patch 直写化归 1.13）。apply 薄形态保留两职责：
//   ① 安装互斥双向守卫（INV-3——bug ef3e92ea）：solo 成员已独立激活（任一件在场标记
//      服务已在）即 forge-bundle-conflict error 留痕 + throw loud-fail（1.32 前此分支为
//      warn 让位——静默共存即 bug 本体）；五件全缺席（正常形态）即 provide 组合标记
//      （FORGE_COMBO_SERVICE_KEY——成员 apply 守卫判据单源）+ forge-bundle-apply info 留痕；
//   ② 生命周期诊断 emitDiag（forge-bundle-apply / forge-bundle-conflict——AGENTS §7 禁 console）。
// 成员侧守卫 = 各件 host/install-mutex.ts（comboMark 组合装载标记判据——同 id 行键合并
// 越装可区分；两侧行激活序无论先后，后激活一侧必然现查到对侧在场并 loud-fail）。
// Workbench 生长点：forge-workbench 期 read/orchestrate 目录、内部 RPC 与自有 host
// 逻辑在此随包构建自动并入——六插行与 file: 依赖零变化。
import { emitDiag } from "@dsh-forge/lib-diag";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FORGE_COMBO_SERVICE_KEY, PRESENCE_SERVICE_KEYS, type ComposedKey, type ForgeConfig } from "./assembly.js";

export const name = "@dsh-forge/forge"; // loader ID 校验 = 包名（产物契约）

/** 本包包名（experts.registerRoot 的 pluginName 实参——专家实例 ID 前缀 `@dsh-forge/forge#键`）。 */
export const FORGE_BUNDLE_PACKAGE_NAME = "@dsh-forge/forge" as const;

/** 随包 experts/ 目录解析（源 host/index.ts 深包根 1 级、dist bundle dist/host/index.js 深
 * 2 级——双候选取在场目录；均缺席 = undefined 由注册面 warn 留痕）。 */
function bundledExpertsRoot(moduleUrl: string = import.meta.url): string | undefined {
  for (const rel of ["../../experts/", "../experts/"] as const) {
    const dir = fileURLToPath(new URL(rel, moduleUrl));
    if (existsSync(dir)) return dir;
  }
  return undefined;
}

/**
 * 随包内置专家档案注册（experts.registerRoot 装配行——AGENTS 1.6 配方）：惰性
 * experts 服务 reflect 现查 + try/catch、检测结果零缓存；expert-squad 缺席 =
 * fail-soft + warn 留痕（不阻载 forge 激活）。registerRoot 侧已主动触发全部已建
 * registry 换代（plugins/expert-squad host/index.ts registerRoot 注记）——本面零
 * refresh 调用。
 */
export function registerBuiltinExpertsRoot(ctx: HostCtx): void {
  let experts: unknown;
  try {
    experts = ctx.reflect?.get?.("experts");
  } catch {
    experts = undefined; // 反射异常视同缺席（fail-soft）
  }
  const register = (experts as { registerRoot?: unknown } | undefined)?.registerRoot;
  if (typeof register !== "function") {
    emitDiag(ctx, {
      event: "forge-experts-register",
      level: "warn",
      process: "main",
      message: "专家池静置：experts 服务缺席（expert-squad 未装/未供）——随包专家档案零注册（fail-soft 不阻载）",
    });
    return;
  }
  const dir = bundledExpertsRoot();
  if (dir === undefined) {
    emitDiag(ctx, {
      event: "forge-experts-register",
      level: "warn",
      process: "main",
      message: "随包 experts/ 目录解析缺席——内置专家档案零注册（fail-soft 不阻载）",
    });
    return;
  }
  try {
    register.call(experts, ctx, dir, FORGE_BUNDLE_PACKAGE_NAME);
    emitDiag(ctx, {
      event: "forge-experts-register",
      level: "info",
      process: "main",
      message: `随包内置专家档案注册完成：${dir}（experts.registerRoot——换代由 expert-squad 侧承担）`,
    });
  } catch (cause) {
    emitDiag(ctx, {
      event: "forge-experts-register",
      level: "warn",
      process: "main",
      message: `experts.registerRoot 调用失败——随包专家档案零注册（fail-soft 不阻载）：${String(cause)}`,
    });
  }
}

/** 宿主 ctx 窄面（cordis Context 结构子集——reflect 现查/根 registry provide + diag emit） */
interface HostCtx {
  /**
   * 服务反射面（在场守卫消费点现查——可选具名服务官方面取法）。provide = 根 registry
   * 供服（knowledge dirKeys.knowledge 先例——ctx.provide 是插件 fiber 局部域，兄弟行
   * fiber 不可达；跨插件判据单源必须走 reflect.provide 根供服）。
   */
  reflect?: { get?(name: string): unknown; provide?(name: string, value: unknown): unknown };
  /** 诊断发射面（diag/log 事件域——emitDiag 消费面） */
  emit(event: string, payload: unknown): unknown;
}

/**
 * 在场守卫单件现查（AGENTS §1.6——检测永不缓存，每个消费点调用期求值）。
 *
 * 【reflect 静态禁令豁免落款（AGENTS §1.6 / 提案评审 N3/N4 + P0 #7）】此处
 * `ctx.reflect.get` 为新代码非默认配方的局部成因例外：守卫对象 = 五件「是否已
 * 独立激活」，可选项天然无类型化消费面（type-only import 只保五件模块类型，
 * 不保跨件服务类型）；具体服务类型化消费已归各消费件自身。守卫现查 + try/catch
 * 吞异常视同缺席 + 结果零 memoize——三铁律逐条满足。
 */
function isMemberActive(ctx: HostCtx, key: ComposedKey): boolean {
  try {
    return ctx.reflect?.get?.(PRESENCE_SERVICE_KEYS[key]) != null;
  } catch {
    return false; // 反射异常视同缺席（fail-soft——检测不阻载 forge 自身激活）
  }
}

/**
 * forge apply（薄形态——聚合 Bundle/solo 双场景通用）：
 * 逐件在场现查（消费点调用期求值，零缓存）→ 任一件已独立激活（solo 越装场景）
 * 即 forge-bundle-conflict error 留痕 + throw loud-fail（INV-3——不静默共存）；
 * 五件全缺席（bundle 通道正常形态）即 provide 组合标记 + forge-bundle-apply info
 * 留痕确认激活。config 参数为 Workbench 生长点保留（{ home } 唯一键同源——当前
 * 零消费，forge-workbench 期 host 逻辑在此取用）。
 */
export function apply(ctx: HostCtx, _config: ForgeConfig = {}): void {
  const keys = Object.keys(PRESENCE_SERVICE_KEYS) as ComposedKey[];
  const present = keys.filter((key) => isMemberActive(ctx, key));
  if (present.length > 0) {
    // INV-3 安装互斥（bug ef3e92ea）：solo 成员越装场景——loud-fail 拒载，不静默让位。
    emitDiag(ctx, {
      event: "forge-bundle-conflict",
      level: "error",
      process: "main",
      message: `INV-3 安装互斥冲突：五件已独立激活（solo 越装场景），forge 聚合 bundle 拒绝激活：${present.join(",")}`,
    });
    throw new Error(
      `[INV-3] 安装互斥冲突：solo 成员已独立激活（${present.join(",")}），` +
        `forge 聚合 bundle 不得越装——请卸载 solo 包或改用 solo 通道`,
    );
  }
  // 组合标记根 registry 供服（成员 apply 守卫现查消费点——ctx.provide 是插件 fiber
  // 局部域、兄弟行不可达，跨插件判据必须 reflect.provide 根供服——knowledge dirKeys
  // 先例同径）。标记仅是激活事实单点，检测仍逐点现查。
  try {
    ctx.reflect?.provide?.(FORGE_COMBO_SERVICE_KEY, { channel: "forge-bundle" });
  } catch {
    // provide 失败不阻载 forge 自身激活（成员侧守卫将视缺席放行——越装防护仍由
    // forge 侧在场守卫承接，不因标记下发失败产生静默面）。
  }
  // 随包内置专家档案注册（experts.registerRoot 装配行——experts 缺席 fail-soft 不阻载）。
  registerBuiltinExpertsRoot(ctx);
  emitDiag(ctx, {
    event: "forge-bundle-apply",
    level: "info",
    process: "main",
    message: "forge host 薄形态激活（五件经 bundle 六插行官方默认路径在场）",
  });
}
