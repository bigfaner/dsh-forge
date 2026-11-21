// @dsh-forge/forge host 入口（forge-aggregate-bundle 1.6 薄化）：
// 聚合 Bundle 主通道下五件经 patch 六插行激活（官方默认路径——依赖落盘后插行激活
// 天然成立），COMPOSED 组合段与 typert 手工缝解引用退役（组合/派发归 patch !!js 行，
// assembly.ts 只余在场守卫具名服务键与 config 类型；patch 直写化归 1.13）。apply 薄形态保留两职责：
//   ① 防双激活守卫——solo 场景 forge 与五件并存时（任一件在场标记服务已在）跳过留痕
//      （同 id 双激活 = loader throw，守卫前置让位）；
//   ② 生命周期诊断 emitDiag（forge-bundle-apply / forge-bundle-skip——AGENTS §7 禁 console）。
// Workbench 生长点：forge-workbench 期 read/orchestrate 目录、内部 RPC 与自有 host
// 逻辑在此随包构建自动并入——六插行与 file: 依赖零变化。
import { emitDiag } from "@dsh-forge/lib-diag";
import { PRESENCE_SERVICE_KEYS, type ComposedKey, type ForgeConfig } from "./assembly.js";

export const name = "@dsh-forge/forge"; // loader ID 校验 = 包名（产物契约）

/** 宿主 ctx 窄面（cordis Context 结构子集——reflect 现查 + diag emit） */
interface HostCtx {
  /** 服务反射面（在场守卫消费点现查——可选具名服务官方面取法） */
  reflect?: { get?(name: string): unknown };
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
 * 逐件在场现查（消费点调用期求值，零缓存）→ 任一件已独立激活（solo 并存场景，
 * 双激活 = loader throw）即 forge-bundle-skip warn 留痕让位；五件全缺席
 * （bundle 通道正常形态）即 forge-bundle-apply info 留痕确认激活。
 * config 参数为 Workbench 生长点保留（{ home } 唯一键同源——当前零消费，
 * forge-workbench 期 host 逻辑在此取用）。
 */
export function apply(ctx: HostCtx, _config: ForgeConfig = {}): void {
  const keys = Object.keys(PRESENCE_SERVICE_KEYS) as ComposedKey[];
  const present = keys.filter((key) => isMemberActive(ctx, key));
  if (present.length > 0) {
    // solo 并存守卫：任一件在场即让位（不阻载 forge 自身插行激活——留痕不静默）。
    emitDiag(ctx, {
      event: "forge-bundle-skip",
      level: "warn",
      process: "main",
      message: `五件已独立激活（solo 并存场景），forge 薄形态让位跳过：${present.join(",")}`,
    });
    return;
  }
  emitDiag(ctx, {
    event: "forge-bundle-apply",
    level: "info",
    process: "main",
    message: "forge host 薄形态激活（五件经 bundle 六插行官方默认路径在场）",
  });
}
