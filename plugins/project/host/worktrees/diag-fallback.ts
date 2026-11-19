// 诊断缝缺席的 console 兜底单出口——lib 公共包归拢（plugin-project 1.2 双源归一）后的
// 兼容面：本体（按级分流 error→console.error、其余→console.warn，与 core telemetry
// diag-console 兜底同逻辑单源）已迁 lib/diag，本文件仅 re-export（三站点既有 import 面
// 零改动）。禁新增直落 console 诊断站点——一律经 @dsh-forge/lib-diag 兜底面。
export { consoleDiagFallback, type DiagLevel } from '@dsh-forge/lib-diag'
