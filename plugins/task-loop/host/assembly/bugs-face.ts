// host/assembly · bugs-face.ts —— bugs 域服务面取法（bug 3a776ecc）。
//
// 两个来源形状不同：
//   · 插件缝 'forge.bugs'（project 提供）= 工厂 () => service——独立模式兜底 stubBugsService
//     无 findRecurrenceCandidates 即不合格，落 core 兜底；
//   · core 'forgeBugs' = 服务本体（迁移期兜底，插件缺席/劣形时才用）。
// 次序与判定同宿主 apps/host/src/boot/child.ts forgeBugsServiceOf：插件缝优先；缝不可达、
// 抛错、或解包后不合格 → 退 core。
//
// Root cause: 旧取法把两个来源当同一形状——core 在前，且把插件缝的工厂函数直接当服务查方法，
// 于是插件在场时要么读不到、要么恒读 core；此前只靠 core 兜底才未暴露。

import type { RecurrenceBugsFace } from "../dispatch-core/recurrence-faces.js";

type BugsFaceHost = { forgeBugs?: unknown; reflect?: { get?(name: string): unknown } };

/** 值是否为合格 bugs 面（findRecurrenceCandidates 可调） */
function faceOf(value: unknown): RecurrenceBugsFace | undefined {
  return typeof (value as RecurrenceBugsFace | undefined)?.findRecurrenceCandidates === "function"
    ? (value as RecurrenceBugsFace)
    : undefined;
}

/**
 * 插件缝优先解 bugs 面；插件缺席/劣形退 core；两者皆不可得 = undefined（四动词缺席语义）。
 * 不缓存——每次调用现查（AGENTS 1.6：插件可中途装卸）。
 */
export function resolveBugsFace(host: BugsFaceHost): RecurrenceBugsFace | undefined {
  // 插件缝：工厂解包。缝不可达、抛错、或解包后不合格，均不在此返回——落 core 兜底。
  let fromSeam: unknown;
  try {
    const seam = host.reflect?.get?.("forge.bugs");
    if (typeof seam !== "function") throw new Error("forge.bugs seam absent or malformed");
    fromSeam = (seam as () => unknown)();
  } catch {
    fromSeam = undefined;
  }
  const viaSeam = faceOf(fromSeam);
  if (viaSeam !== undefined) return viaSeam;
  try {
    return faceOf(host.forgeBugs);
  } catch {
    return undefined;
  }
}
