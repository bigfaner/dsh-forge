// PROVENANCE: 复制自官方 dsh 源码 ui-conversation/src/client/context-occupancy.ts @ deepseek-harness f059f01ce367748392d8f665c0705fb4302a626b（0.2.0-rc.2，2026-10-22）；升级需人工 re-copy，漂移自担。
// PROVENANCE 适配（imports 重写）：token-meter ContextPressureProjection 以结构镜像承载。
export interface ContextPressureProjection {
  readonly projectedTokens?: number
  readonly pressureTokens?: number
  readonly contextWindow?: number
}

/** Context usage rendered by conversation and Chat status surfaces. */
export interface ContextOccupancy {
  percent: number
  usedTokens: number
  contextWindow: number
}

/**
 * Resolve bounded display occupancy from independently updated pressure fields.
 * @param pressure - latest token-meter projection.
 * @returns occupancy, or null until numerator and capacity are known.
 */
export function contextOccupancy(
  pressure: ContextPressureProjection | undefined,
): ContextOccupancy | null {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (usedTokens === undefined || pressure?.contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
    usedTokens,
    contextWindow: pressure.contextWindow,
  }
}
