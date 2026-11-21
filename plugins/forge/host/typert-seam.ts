// forge typert 手工缝（forge-deep-pack 1.6——P0 核销 #3 定谳形态照抄）：
// 官方 dsh-typert-loader 只锚 loader entry 名扫描 ./typert 工件——forge 组合态下
// 三件工件（project/spec/task-loop）藏在 forge 单入口之后，loader 默认装载不到
// （再导出被 manifest 所有权门拦截：manifest.package 必须归导出包自身；嵌套包进
// packages 配置 loud throw——手工缝是唯一正门）。
// 本模块在装载期静态 import 三件工件（manifest 所有权不变——manifest.package 仍归
// 五件源包，forge 只注册不改造、禁止再导出）；apply 期经 ctx.typert.register(manifest)
// 注册（注册返回 disposer——apply 聚合为卸载回收面交还宿主生命周期）。
// import 形态钉死为字面量静态 import：esbuild inline 档（deep tgz）无法沿计算说明符
// 内联工件，external 档经 bundle-host EXTERNAL 子路径外置——双档通吃唯一形态。
import { TYPERT as projectTypert } from "@dsh-forge/project/typert";
import { TYPERT as specTypert } from "@dsh-forge/spec/typert";
import { TYPERT as taskLoopTypert } from "@dsh-forge/task-loop/typert";
import { emitDiag } from "@dsh-forge/lib-diag";

/** typert 注册宿主 ctx 窄面（cordis Context 结构子集——typert 服务键 + diag emit）。 */
interface TypertSeamCtx {
  /** typert registry 服务（官方 dsh-typert-registry——register 返回卸载 disposer） */
  typert?: { register?(manifest: unknown): unknown };
  /** 诊断发射面（diag/log 事件域——emitDiag 消费面） */
  emit(event: string, payload: unknown): unknown;
}

/** 手工缝成员键（knowledge/expert-squad 无 typert exports——P0 #3 事实修正，恰三件）。 */
export const TYPERT_SEAM_MEMBERS = ["project", "spec", "task-loop"] as const;

/** 三件工件 manifest（装载期 import 产物——所有权不变，禁再导出/禁改造）。 */
const TYPERT_MANIFESTS = [projectTypert, specTypert, taskLoopTypert] as const;

/**
 * typert 手工缝注册：三件 manifest 逐件 ctx.typert.register。
 *
 * 在场性语义（AGENTS §1.6）：ctx.typert 服务键整体缺席（非 typert 宿主）→ 零注册
 * 零固定税（官方 loader inject 语义同径——非失败路径，不 emit 不 memoize）；服务在
 * 场而 register 不可用/单件注册 throw → fail-soft 不阻载 + error 级 emitDiag 留痕
 * （诊断不静默——AGENTS §7）。工件包缺席（MODULE_NOT_FOUND）在本模块装载期即
 * loud throw（字面量静态 import）——B1 缺席即硬失败语义由此承担。
 *
 * @returns 卸载回收面（任一件注册成功时聚合 disposer；否则 undefined）
 */
export function registerTypertManifests(ctx: TypertSeamCtx): (() => void) | undefined {
  const typert = ctx.typert;
  if (typert === undefined || typeof typert.register !== "function") return undefined;
  const disposers: Array<() => unknown> = [];
  for (const manifest of TYPERT_MANIFESTS) {
    try {
      const disposer = typert.register(manifest) as unknown;
      if (typeof disposer === "function") disposers.push(disposer as () => unknown);
    } catch (cause) {
      emitDiag(ctx, {
        event: "forge-typert-register",
        level: "error",
        process: "main",
        message: `typert 手工缝注册失败（fail-soft 不阻载——registry 侧拒绝/重复注册）：${String(cause)}`,
      });
    }
  }
  if (disposers.length === 0) return undefined;
  return () => {
    for (const dispose of disposers) dispose();
  };
}
