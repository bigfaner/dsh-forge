// workbench/projects-identity — D11 identity domain barrel (task 1.2).
//
// normalize.ts        path normalization pipeline (application-layer single
//                     source of the folded comparison key)
// identity-match.ts   three-tier comparison + self-heal payload (canonical →
//                     pathKey → (dev,ino); no DB writes)
// detect.ts           C7 evidence detection + Interface 1 DetectReport
//
// Consumers: the 1.3 IPC verbs (probeProjectPath / registerProject) and the
// v3 migration backfill (store/migrate.ts imports normalize.ts — pure
// fs/path leaf, layering direction preserved).

export * from './normalize.ts'
export * from './identity-match.ts'
export * from './detect.ts'
