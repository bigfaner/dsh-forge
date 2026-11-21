// forge 防双激活守卫薄 host 配置面（forge-deep-pack 1.4 遗形收敛——patch 直写化后
// 本文件只剩在场守卫消费的具名服务键与 forge config 类型；派发映射原 derivePluginConfigs
// 面已随生成器退役，cordis.patch.yml 即手写正本）。

// ── 延伸常量（patch !!js 表达式同源参照——静态双检锚 plugins/forge/tests/config-contract.test.ts）
/** DSH_HOME 环境键（forge home 缺省派生锚——{DSH_HOME}/forge） */
export const DSH_HOME_ENV = 'DSH_HOME'
/** forge home 缺省后缀（{DSH_HOME} → {DSH_HOME}/forge） */
export const FORGE_HOME_SUFFIX = '/forge'

/** forge 统一 schema（最终形：home 唯一键——不设 db/tasksHome 覆写键） */
export interface ForgeConfig {
  home?: string
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

// ── INV-3 安装互斥守卫判据单源（bug ef3e92ea——forge-aggregate-bundle 1.32）──
/**
 * forge 组合标记服务键（forge apply 激活期 provide——成员 apply 守卫消费点现查）：
 * bundle 正常装载路径成员行先经 forge apply（六插行序 = dshforge 首）拿到标记；
 * solo 越装行（无 comboMark）现查到标记即 loud-fail。成员包零 import 本常量
 * （no-cross-plugin-imports 红线）——同值字面量对账 pin 归 tests/install-mutex.test.ts。
 */
export const FORGE_COMBO_SERVICE_KEY = 'forgeCombo'
/** bundle 六插行组合装载标记 config 键（成员行下发 comboMark: true——solo patch 行缺此键） */
export const COMBO_MARK_CONFIG_KEY = 'comboMark'

// ── skills 自锚（P0 核销 #5 处方 C——forge-deep-pack 1.6；1.14 返工落点 dist）──
/** forge 包说明符（skills 自锚 resolve 锚——只依赖 forge 自己，三档通吃） */
export const FORGE_PKG_SPECIFIER = '@dsh-forge/forge'
/** 五件 skills 聚合子目录名（= COMPOSED key——聚合面 forge/dist/skills/<member>/，构建期物化生成物） */
export const SKILL_MEMBER_DIRS = ['project', 'spec', 'task-loop', 'expert-squad', 'knowledge'] as const

/**
 * skills 自锚单表达式（!!js 方言——official userPatchesSchema 核销同款 baseUrl 形态）：
 * resolve('@dsh-forge/forge/package.json') → 包根 → join('dist', 'skills', '<member>')
 * （构建期生成物——build 链 bundle 后物化，freshness 门天然覆盖）。
 * 跨包锚三硬前提（缺席包 MODULE_NOT_FOUND 无 fail-soft、./package.json 出口缺失、
 * 层序覆盖脆弱）由「只依赖 forge 自己」单表达式根除——P0 #5 处方 C 定谳。
 */
export function skillDirSelfAnchorExpr(member: string): string {
  return `process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('${FORGE_PKG_SPECIFIER}/package.json')), 'dist', 'skills', '${member}')`
}
