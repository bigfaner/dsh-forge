// workbench/prefs/registry — 偏好键注册表(任务 3.1)。
//
// 键集封闭(Hard Rule):仅本注册表内键可写(prefs 表 CHECK 只锁 scope 词表,
// 键集校验 = 本应用层注册表 —— schema-v2.sql §6 注);surface 类键禁入继承链
// (PRD D3:结构性项目事实,检测得出,不参与继承)。
//
// 键 → 类型/控件映射权威 = forge config 键定义(forge-cli `pkg/forgeconfig`,
// Hard Rule:应用侧消费不复制语义)。本文件是那份定义的**键集投影**,逐键对齐
// Go 源(2026-09-23 核对):
//   - auto.*       = AutoConfig(config_auto.go):6 个 ModeToggle(quick/full)
//                    + gitPush + eval 子块 4 布尔;默认值 = AutoConfigDefaults();
//   - worktree.*   = WorktreeConfig(config.go):source-branch 文本 + includes
//                    列表(UI 逗号分隔文本,保存时经偏好 API 解析为列表);
//   - coverage.*   = CoverageConfig(config.go yaml:",inline" map,键 =
//                    coverage.<task-type>):入键集依据 = spike-4 结论
//                    「键集须补 coverage.*,PRD D3 枚举漏列」;默认值 =
//                    CoverageConfigDefaults() 五个已知类型(值形态 =
//                    Go CoverageStrategy 结构 {type:'percentage',percentage} |
//                    {type:'maintain'});
//   - eval.*       = EvalSettings(config_auto.go):7 评估类型 ×
//                    target/iterations(*int,nil=未配置回退 rubric 默认);
//                    默认值 = EvalSettingsDefaults()(rubric frontmatter)。
//   logs./test-framework/languages/project-type/version = 结构性/应用级事实,
//   非 D3 键集(同 surfaces 口径排除)。
//
// 类型元数据经 getPrefs API 暴露(UI 不硬编码键清单 —— ui-design §偏好编辑面);
// 值域校验(类型越界 → ERR_PREF_VALUE_INVALID)同源本表。

/** 偏好键值类型词表(布尔/数值/文本/列表/覆盖策略;经 API 暴露)。 */
export type PrefKeyType = 'boolean' | 'number' | 'text' | 'list' | 'coverage'

/** UI 控件提示(消费 forge config 键定义的类型元数据,不复制语义)。 */
export type PrefControl = 'toggle' | 'number-input' | 'text-input' | 'coverage-input'

/** 键分组(UI 折叠区 auto/worktree/coverage/eval)。 */
export type PrefGroup = 'auto' | 'worktree' | 'coverage' | 'eval'

/** Go CoverageStrategy 同形值(coverage.<task-type> 的存储形态)。 */
export type CoverageStrategy =
  | { readonly type: 'percentage'; readonly percentage: number }
  | { readonly type: 'maintain' }

/** 单键定义(键名 + 类型元数据 + 权威默认值 + 数值域)。 */
export interface PrefKeyDefinition {
  readonly key: string
  readonly group: PrefGroup
  readonly type: PrefKeyType
  readonly control: PrefControl
  /**
   * forge config 权威默认值(三级皆未设置时的生效值,source='default'):
   * auto.* = AutoConfigDefaults;coverage.* = CoverageConfigDefaults;
   * eval.* = EvalSettingsDefaults(rubric 默认);worktree.* 无默认 → 缺省
   * (source=null,value=null)。
   */
  readonly defaultValue?: boolean | number | string | readonly string[] | CoverageStrategy
  /** number 键下界(含);缺省 = 0。 */
  readonly min?: number
  /** number 键上界(含);缺省 = 无上界。 */
  readonly max?: number
}

const toggle = (key: string, defaultValue: boolean): PrefKeyDefinition => ({
  key,
  group: 'auto',
  type: 'boolean',
  control: 'toggle',
  defaultValue,
})

const modeToggle = (name: string, quick: boolean, full: boolean): readonly PrefKeyDefinition[] => [
  toggle(`auto.${name}.quick`, quick),
  toggle(`auto.${name}.full`, full),
]

const evalNumber = (key: string, defaultValue: number, max: number): PrefKeyDefinition => ({
  key,
  group: 'eval',
  type: 'number',
  control: 'number-input',
  defaultValue,
  min: 0,
  max,
})

const coverage = (taskType: string, defaultValue: CoverageStrategy): PrefKeyDefinition => ({
  key: `coverage.${taskType}`,
  group: 'coverage',
  type: 'coverage',
  control: 'coverage-input',
  defaultValue,
})

/**
 * 完整键注册表(封闭键集;顺序 = 暴露序:auto → worktree → coverage → eval)。
 * 默认值逐条对齐 forgeconfig AutoConfigDefaults / CoverageConfigDefaults /
 * EvalSettingsDefaults(Go 源 2026-09-23 形态)。
 */
export const PREF_KEY_REGISTRY: readonly PrefKeyDefinition[] = [
  // auto.*(AutoConfigDefaults:test q=false/f=true;consolidateSpecs t/t;
  // cleanCode f/f;validation f/f;runTasks q=true/f=false;gitPush false;
  // knowledgeSave q=true/f=false;eval proposal=true prd=false uiDesign=true
  // techDesign=false)
  ...modeToggle('test', false, true),
  ...modeToggle('consolidateSpecs', true, true),
  ...modeToggle('cleanCode', false, false),
  ...modeToggle('validation', false, false),
  ...modeToggle('runTasks', true, false),
  toggle('auto.gitPush', false),
  ...modeToggle('knowledgeSave', true, false),
  toggle('auto.eval.proposal', true),
  toggle('auto.eval.prd', false),
  toggle('auto.eval.uiDesign', true),
  toggle('auto.eval.techDesign', false),
  // worktree.*(WorktreeConfig;无 Go 默认 —— 未设置 = 无值)
  {
    key: 'worktree.source-branch',
    group: 'worktree',
    type: 'text',
    control: 'text-input',
  },
  {
    key: 'worktree.includes',
    group: 'worktree',
    type: 'list',
    control: 'text-input',
  },
  // coverage.*(CoverageConfigDefaults 五已知类型;Go map 开放面在应用侧
  // 以封闭注册表承载 —— Hard Rule 键集封闭)
  coverage('coding.feature', { type: 'percentage', percentage: 80 }),
  coverage('coding.enhancement', { type: 'percentage', percentage: 60 }),
  coverage('coding.fix', { type: 'percentage', percentage: 60 }),
  coverage('coding.refactor', { type: 'maintain' }),
  coverage('coding.cleanup', { type: 'maintain' }),
  // eval.*(EvalSettingsDefaults:proposal 900/3 prd 900/3 design 900/3
  // ui 950/3 journey 850/3 contract 850/3 consistency 900/3;
  // target 上界 1200 / iterations 上界 10 = 宽域防越界,不约束 rubric 语义)
  evalNumber('eval.proposal.target', 900, 1200),
  evalNumber('eval.proposal.iterations', 3, 10),
  evalNumber('eval.prd.target', 900, 1200),
  evalNumber('eval.prd.iterations', 3, 10),
  evalNumber('eval.design.target', 900, 1200),
  evalNumber('eval.design.iterations', 3, 10),
  evalNumber('eval.ui.target', 950, 1200),
  evalNumber('eval.ui.iterations', 3, 10),
  evalNumber('eval.journey.target', 850, 1200),
  evalNumber('eval.journey.iterations', 3, 10),
  evalNumber('eval.contract.target', 850, 1200),
  evalNumber('eval.contract.iterations', 3, 10),
  evalNumber('eval.consistency.target', 900, 1200),
  evalNumber('eval.consistency.iterations', 3, 10),
]

/** 键 → 定义索引(封闭键集查询面;O(1),构建一次)。 */
export const PREF_KEY_MAP: ReadonlyMap<string, PrefKeyDefinition> = new Map(
  PREF_KEY_REGISTRY.map(definition => [definition.key, definition]),
)

// ---------------------------------------------------------------------------
// 值校验与规范化(键集/类型校验的内核权威面;tech-design §Error Handling:
// 键集外 → ERR_PREF_KEY_UNKNOWN,类型越界 → ERR_PREF_VALUE_INVALID)
// ---------------------------------------------------------------------------

/** prefs 域错误码(tech-design 错误表 prefs 段 + scope 形态的配套码)。 */
export type PrefErrorCode = 'ERR_PREF_KEY_UNKNOWN' | 'ERR_PREF_VALUE_INVALID' | 'ERR_PREF_SCOPE_INVALID'

/** prefs 域错误(code 经 IPC 错误封装原码透传)。 */
export class PrefDomainError extends Error {
  constructor(
    readonly code: PrefErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'PrefDomainError'
  }
}

/** 地址段判定(镜像 task-repo isAddressSegment:禁路径分隔/控制字符)。 */
function isSegment(segment: string): boolean {
  if (segment === '') return false
  for (const ch of segment) {
    const code = ch.codePointAt(0)
    if (code === undefined) return false
    if (code <= 0x1f || code === 0x7f) return false
    if (ch === '/' || ch === '\\') return false
  }
  return true
}

export { isSegment }

function valueInvalid(key: string, reason: string): PrefDomainError {
  return new PrefDomainError(
    'ERR_PREF_VALUE_INVALID',
    `preference value for ${JSON.stringify(key)} is invalid: ${reason}`,
  )
}

/**
 * 校验并规范化一个待写值。规范化产物 = 落库形态(list → string[];
 * coverage → CoverageStrategy 结构;标量原样);类型越界/形态错 → 抛
 * ERR_PREF_VALUE_INVALID。键集外键 → ERR_PREF_KEY_UNKNOWN(调用面统一
 * 前置断言,本函数假定 def 已命中)。
 */
export function normalizePrefValue(def: PrefKeyDefinition, value: unknown): unknown {
  switch (def.type) {
    case 'boolean': {
      if (typeof value !== 'boolean') {
        throw valueInvalid(def.key, `expected a boolean, got ${typeof value}`)
      }
      return value
    }
    case 'number': {
      const min = def.min ?? 0
      const max = def.max ?? Number.MAX_SAFE_INTEGER
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw valueInvalid(def.key, `expected an integer, got ${JSON.stringify(value)}`)
      }
      if (value < min || value > max) {
        throw valueInvalid(def.key, `integer ${String(value)} out of range [${String(min)}, ${String(max)}]`)
      }
      return value
    }
    case 'text': {
      // 文本键(如 worktree.source-branch = git 分支名)允许 `/`(非文件路径
      // 载荷);仅拒空串与控制字符。
      if (typeof value !== 'string' || value.trim() === '') {
        throw valueInvalid(def.key, `expected a non-empty string, got ${JSON.stringify(value)}`)
      }
      for (const ch of value.trim()) {
        const code = ch.codePointAt(0)
        if (code !== undefined && code <= 0x1f) {
          throw valueInvalid(def.key, 'string carries a control character')
        }
      }
      return value.trim()
    }
    case 'list': {
      // UI 逗号分隔文本面(ui-design:保存时经偏好 API 解析为列表)+ 数组直写面
      // (数组面元素必须全为字符串 —— 非字符串元素是形态错,不静默丢弃)。
      // 条目内容不再做段校验:includes 形态 = glob/路径样式(worktree.includes
      // = 路径清单),路径分隔符是合法载荷,仅拒空串与控制字符。
      let items: readonly unknown[]
      if (typeof value === 'string') {
        items = value.split(',')
      } else if (Array.isArray(value)) {
        if (value.some(item => typeof item !== 'string')) {
          throw valueInvalid(def.key, 'array form must carry string entries only')
        }
        items = value
      } else {
        throw valueInvalid(def.key, `expected a comma-separated string or a string array, got ${typeof value}`)
      }
      const normalized = items
        .map(item => (item as string).trim())
        .filter(item => item !== '')
      if (normalized.length === 0) {
        throw valueInvalid(def.key, 'list must carry at least one non-empty entry (use clearPrefOverride to unset)')
      }
      for (const item of normalized) {
        for (const ch of item) {
          const code = ch.codePointAt(0)
          if (code !== undefined && code <= 0x1f) {
            throw valueInvalid(def.key, `list entry ${JSON.stringify(item)} carries a control character`)
          }
        }
      }
      return normalized
    }
    case 'coverage': {
      // Go config set 面 = 裸数字(→ percentage);get 面 = 'maintain' 或数字串。
      // 接受三种入参:数字 / 'maintain' / CoverageStrategy 结构;落库 = 结构。
      if (typeof value === 'number') {
        if (!Number.isInteger(value) || value < 0 || value > 100) {
          throw valueInvalid(def.key, `percentage must be an integer in [0, 100], got ${JSON.stringify(value)}`)
        }
        return { type: 'percentage', percentage: value } satisfies CoverageStrategy
      }
      if (value === 'maintain') {
        return { type: 'maintain' } satisfies CoverageStrategy
      }
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const strategy = value as { type?: unknown; percentage?: unknown }
        if (strategy.type === 'maintain') {
          return { type: 'maintain' } satisfies CoverageStrategy
        }
        if (strategy.type === 'percentage') {
          const percentage = strategy.percentage
          if (typeof percentage !== 'number' || !Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
            throw valueInvalid(def.key, `percentage must be an integer in [0, 100], got ${JSON.stringify(percentage)}`)
          }
          return { type: 'percentage', percentage } satisfies CoverageStrategy
        }
      }
      throw valueInvalid(
        def.key,
        `expected a percentage integer, 'maintain', or {type:'percentage'|'maintain',...}, got ${JSON.stringify(value)}`,
      )
    }
  }
}

/** 注册表键断言:键集外 → ERR_PREF_KEY_UNKNOWN(携带全键集规模便于定位)。 */
export function requireKnownPrefKey(key: string): PrefKeyDefinition {
  const def = PREF_KEY_MAP.get(key)
  if (def === undefined) {
    throw new PrefDomainError(
      'ERR_PREF_KEY_UNKNOWN',
      `preference key ${JSON.stringify(key)} is not in the closed forge pref registry (${String(PREF_KEY_REGISTRY.length)} keys: auto.*/worktree.*/coverage.*/eval.*, surfaces excluded)`,
    )
  }
  return def
}
