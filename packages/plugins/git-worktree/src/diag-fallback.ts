// 诊断缝缺席的 console 兜底单出口（diag-face-consolidation 统一口径——bug 7ba48c55）：
// 按级分流 error→console.error、其余→console.warn（expert-squad index.ts 配方），
// 三站点（index.ts config.diag 兜底 / rpc-service.ts deps.warn 兜底 / session-send-wrap.ts
// warn 参数兜底）共源，禁新增直落 console 诊断站点。
export type DiagLevel = 'warn' | 'error'

/** console 兜底（按级分流）：缝缺席时诊断不静默，error 级走 console.error、其余 console.warn */
export function consoleDiagFallback(line: string, level: DiagLevel = 'warn'): void {
  if (level === 'error') console.error(line)
  else console.warn(line)
}
