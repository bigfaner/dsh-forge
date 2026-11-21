// forge 配置派发单源（forge-deep-pack 1.4——提案 §二.2 定谳设计照抄）：
//   resolveForgeLayout（home 唯一输入，db/tasksHome 恒延伸）+ derivePluginConfigs
//   （home 唯一键 → 五件 config 派发映射）。本文件为纯函数模块：零 import、零 fs、
//   零 db——派发映射与 patch 生成（cordis.patch.yml config 行）共用同一延伸常量，
//   静态双检锚 tests/forge/derive-configs.test.ts（漂移红）。

// ── 延伸常量（延伸规则单源——patch !!js 表达式由同源常量物化，双检防漂移）────
/** DSH_HOME 环境键（forge home 缺省派生锚——{DSH_HOME}/forge） */
export const DSH_HOME_ENV = 'DSH_HOME'
/** forge home 缺省后缀（{DSH_HOME} → {DSH_HOME}/forge） */
export const FORGE_HOME_SUFFIX = '/forge'
/** 共库落点（相对 forge home——{home}/db/forge/forge.db，主提案 §十 目录树同源） */
export const DB_RELATIVE = '/db/forge/forge.db'
/** 任务运行产物根（相对 forge home——{home}/projects，bug a93c1277 域对齐产物树） */
export const TASKS_RELATIVE = '/projects'

/** forge 统一 schema（最终形：home 唯一键——不设 db/tasksHome 覆写键） */
export interface ForgeConfig {
  home?: string
}

/** 延伸解析结果（home 唯一输入 → db/tasksHome 恒延伸） */
export interface ForgeLayout {
  home?: string
  db?: string
  tasksHome?: string
}

/** 五件派发映射（键 = COMPOSED key——提案 §二.2 派发示例逐键） */
export type ForgePluginConfigs = {
  project: { home?: string; dbFile?: string }
  spec: { dbFile?: string }
  'task-loop': { dbFile?: string; tasksHome?: string }
  'expert-squad': Record<string, never>
  knowledge: { dbFile?: string }
}

/**
 * 五件在场标记服务键（在场守卫消费点现查用——各件 provide 的具名服务正源）：
 *   project = forge.projects 五缝（点分缝，PROJECT_SEAM_KEYS.projects 同值——
 *   camelCase forgeProjects 恒 miss 判例钉死）；spec = forgeSpecs；
 *   task-loop = forgeTasks；expert-squad = experts；knowledge = knowledge。
 */
export const PRESENCE_SERVICE_KEYS = {
  project: 'forge.projects',
  spec: 'forgeSpecs',
  'task-loop': 'forgeTasks',
  'expert-squad': 'experts',
  knowledge: 'knowledge',
} as const

export type ComposedKey = keyof typeof PRESENCE_SERVICE_KEYS

// ── skills 自锚（P0 核销 #5 处方 C——forge-deep-pack 1.6）──────────────────
/** forge 包说明符（skills 自锚 resolve 锚——只依赖 forge 自己，三档通吃） */
export const FORGE_PKG_SPECIFIER = '@dsh-forge/forge'
/** 五件 skills 聚合子目录名（= COMPOSED key——聚合面 forge/skills/<member>/） */
export const SKILL_MEMBER_DIRS = ['project', 'spec', 'task-loop', 'expert-squad', 'knowledge'] as const

/**
 * skills 自锚单表达式（!!js 方言——official userPatchesSchema 核销同款 baseUrl 形态）：
 * resolve('@dsh-forge/forge/package.json') → 包根 → join('skills', '<member>')。
 * 跨包锚三硬前提（缺席包 MODULE_NOT_FOUND 无 fail-soft、./package.json 出口缺失、
 * 层序覆盖脆弱）由「只依赖 forge 自己」单表达式根除——P0 #5 处方 C 定谳。
 * 生成脚本 scripts/aggregate-assets.mjs 由本函数同源物化 patch customSkillDirs 行
 * （静态双检锚 tests/forge/asset-aggregation.test.ts，漂移红）。
 */
export function skillDirSelfAnchorExpr(member: string): string {
  return `process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('${FORGE_PKG_SPECIFIER}/package.json')), 'skills', '${member}')`
}

const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const readDshHome = (env: NodeJS.ProcessEnv): string | undefined => nonEmpty(env[DSH_HOME_ENV] as string | undefined)

/**
 * 延伸规则单源：home 唯一输入 → { home, db, tasksHome }（db/tasksHome 恒延伸，
 * 不设覆写键——提案 §二.2 配置通道定谳）。home 缺省 = {DSH_HOME}/forge；
 * DSH_HOME 与 config.home 双缺 → 三键全 undefined（派发回落各件单装缺省装配，
 * fail-soft 不阻载——旧五插行同语义）。路径分隔符恒 posix `/`（提案示例形态）。
 */
export function resolveForgeLayout(config: ForgeConfig = {}, env: NodeJS.ProcessEnv = process.env): ForgeLayout {
  const home = nonEmpty(config.home) ?? (readDshHome(env) !== undefined ? readDshHome(env)! + FORGE_HOME_SUFFIX : undefined)
  return {
    home,
    db: home !== undefined ? home + DB_RELATIVE : undefined,
    tasksHome: home !== undefined ? home + TASKS_RELATIVE : undefined,
  }
}

/** undefined 值键剔除（派发对象不携死键——patch 整体替换语义下多余键会抹掉单装缺省） */
function compact<T extends object>(object: T): T {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as T
}

/**
 * 派发单源：home 唯一键 → 五件 config 映射（与提案 §二.2 派发示例逐键一致——
 * 快照 pin 锚 tests/forge/derive-configs.test.ts，漂移红）。
 *
 * 键面事实源分层：forge 统一面归本函数唯一映射，各件消费键归各件 config schema。
 * project.home 恒 = {DSH_HOME}（自锚派生根——即使 config.home 换根也不随迁，
 * 提案示例定谳）；db → 四持库件统一 dbFile；tasksHome 透传 task-loop；
 * expert-squad 空对象豁免（自有 config 含 defaultAgentOptions/experts 两键——
 * 统一面不透传、维持其缺省，防 pin 封死键面）。
 */
export function derivePluginConfigs(config: ForgeConfig = {}, env: NodeJS.ProcessEnv = process.env): ForgePluginConfigs {
  const layout = resolveForgeLayout(config, env)
  const dshHome = readDshHome(env)
  return {
    project: compact({ home: dshHome, dbFile: layout.db }),
    spec: compact({ dbFile: layout.db }),
    'task-loop': compact({ dbFile: layout.db, tasksHome: layout.tasksHome }),
    'expert-squad': {},
    knowledge: compact({ dbFile: layout.db }),
  }
}
