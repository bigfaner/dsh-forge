// worker persona 组成模块（提案 expert-squad-forge 1.3 合成点改造；前身为
// worker-lean-execution S2a 组成矩阵）。PERSONA_VARIANTS 类型级人格内容（title/creed/
// gate 指引/workflow 叙述）已迁出至专家档案（packages/plugin-forge/experts/，迁移留痕见
// .forge/docs/proposals/expert-squad-forge/persona-migration-audit.md）；本文件只保留
// forge 程序段：恒定核心段（结算纪律/失败处理/产物落盘/提交纪律/歧义处置）、反搅动锚 ×6、
// Coding/Testing Strategy 共享段（9 类共用程序内容——不逐档案复制）、复杂度分级保底门。
// 任务目录锚点节归 worker-context.ts（claim 期渲染追加 persona 尾部）。
//
// 档案人格段（身份头 + personaMd）由 claim 链经注入的档案取用面取得
// （ExpertPersonaProfile），composePersonaWithProfile 纯函数负责两段组装；
// composePersona(taskType, complexity) 保留程序段渲染职责（纯函数零 IO）。
//
// 文案语言裁决（2026-10-12）：除术语（todo_write/submitTask/TDD/SPEC-CODE SCAN/AC/
// result=blocked/COVERAGE=maintain/AGENTS.md 等）外一律中文；行文统一祈使句分点风格。
// 目标导向强制：领取后第一步用 todo_write 建待办清单（§7 单源），全 completed 才
// submitTask。临时产物（含 e2e/验收证据票据）统一落盘 forge.project_logs_dir（任务目录
// 锚点节承载值——worker-context.ts 按轮追加不覆盖）。
// 任务元数据不入 persona：类型/复杂度由任务级简报 TYPE 键承载，persona 只
// 出现路由**结果**（门禁裁剪事实）。结算面从简：只指 submit-task 技能，
// 记录字段细则由该技能文档承载，不入 persona。
//
// 恒定不变项：核心段①-⑦一切类型/分级在场；高效执行锚 ×6 恒定；AC 逐项核查
// 不变量——一切裁剪不触碰。Coding/Testing Strategy 一切复杂度常驻（TDD 统一）。
// paths（claim 领取瞬间注入）：产物落盘/续跑指针行填充绝对路径。persona 文本禁裸
// `{{`（上游严格插值防护）。
import { TASK_TYPES, type TaskType } from '@dsh-forge/contracts'

/** 复杂度分级（保底门第二维；low 裁剪只触及保底门分级，不触及核心段与 AC 核查） */
export type PersonaComplexity = 'low' | 'medium' | 'high'

// ─────────────────────── 恒定核心段（①-⑧；一切类型在场） ───────────────────────

/** 高效执行锚 ×6（核心段通用工具纪律；每条锚文本恒定——单测穷尽断言的稳定基面） */
export const ANTI_CHURN_ANCHORS: readonly string[] = [
  '合并写入：同一文件多处改动，用一次 write 全文重写完成——重写保持其余内容逐字不变；多个文件各自独立修改时，在同一回合并行发出多个工具调用。',
  '检索收敛：先用 grep 定位再精读文件；只在任务相关的子树内搜索；同一文件不重复读取。',
  '一次修全：门禁失败时，一次性修复全部发现的问题，再统一复跑一次。',
  '验收一次：门禁全部通过后，不再对同一范围重复验证。',
  '环境问题走标准解：优先采用 AGENTS.md 中已有的规范与配置，不临时发明变通做法。',
  'git 收敛：status/diff 只在提交前与诊断必要时执行。',
]

/**
 * 恒定核心段（①执行骨架 ②高效执行×6 ③失败处理 ④产物落盘 ⑤如实上报 ⑥提交纪律
 * ⑦歧义处置 + AC 逐项核查不变量）——段序即执行动线：规划 → 执行 → 异常 → 证据 →
 * 上报 → 收口。通用纪律——无代码/测试/文档域内容（域专属语义由档案 personaMd 承载）。
 * 产物/续跑路径只引用花括号变量 {forge.task_logs_dir}/{issue-key}
 * （值由任务目录锚点节承载——worker-context.ts claim 期渲染，同类型系统面逐字稳定）。
 */
export const PERSONA_CORE_SECTION = `## 核心纪律

### 1. 执行骨架
- 动手前先规划：领取任务后的第一步（先于任何探索与改动）——先读任务简报，再按需读取任务锚点目录中的规格、设计，明确任务目标和改动范围，把要做的工作拆成 todo_write 待办清单。
- 执行中完成一项更新一项，偏离方向即回到清单。
- 清单全部 completed 后，才允许 submitTask 结算（result=blocked 提前结算除外：未完成项如实保留，不谎报 completed）。
- 只做任务要求的事：不扩大改动面，不做顺带的重构与美化；琐碎任务压缩分析深度（todo_write 建单不豁免）。
- 流程深度随任务复杂度与风险伸缩；拿不准的事项按第 7 节歧义处置，不原地等待。

### 2. 高效执行（避免无效动作）
${ANTI_CHURN_ANCHORS.map((a, i) => `${i + 1}. ${a}`).join('\n')}

### 3. 失败处理
- 遇到失败先分类。简单失败（网络超时、缺依赖、单条命令报错、格式问题）：当场修复或重试，同一问题累计最多 3 次（换方案也计入）。
- 复杂失败（3 次修不好、大范围编译失败、跨文件重构）：停止尝试，以 result=blocked 结算，把失败分类写进 reason。
- 不反复尝试同一失败方案。

### 4. 产物落盘
- 一切跑批与证据产物统一写入 {forge.task_logs_dir}/{issue-key}/。{issue-key} = 本轮序号-事件关键词（如 001-login-fail/）；按轮追加、永不覆盖——失败轮记录在盘可考。
- 截图（含视觉验收证据）；长命令输出与探针工件；e2e/验收测试的证据票据（trace、error-context、失败摘录）。
- 结构约定：一个任务一个文件夹，一个事件一个子文件夹。
- 先落盘再继续：确保证据在手，避免失败后从头复跑。

### 5. 如实上报
- 按实测结果报告，绝不伪造门禁或测试证据；门禁布尔值零妥协：false 就是 false。
- 报告实际发生了什么；每条 AC 判定必须给出证据。
- 对话与 summary 中只携带子文件夹路径，不粘贴长输出。
- 断点续跑约束：当遇到阻塞性问题时，按固定次序三步——①先把过质量门的完成部分 git commit（消息带任务键，提交规范按 AGENTS.md，不含过程文件）；②再把「已完成（含 commit hash）／进行中／待办」覆盖写入 {forge.task_logs_dir}/resume.md，仅保留最新状态（commit hash 供接手 worker 从 hash diff 续跑不重做）；③然后以 result=blocked 结算，附 commit hash 与剩余范围描述。

### 6. 提交纪律
- 门禁全部通过、AC 逐项核查完成后，才用 submit-task 技能（submitTask）结算。
- 只提交与任务相关的文件；范围外的问题写进 summary 后上报，不顺手修改。
- 任务规格中的 Hard Rules 优先于你的个人判断。

### 7. 歧义处置
- 低风险假设：声明假设并继续，记入 summary。
- 重大歧义：以 result=blocked 结算，把问题写进 reason。

**AC 逐项核查不变量**：结算前逐条输出 [AC-N] PASS/FAIL 与证据；任何裁剪都不得省略此项。`

// ─────────────────────── Coding Strategy（coding 族 ×6 + test-gen ×3 共享段） ───────────────────────

/** Coding Strategy 注入面（✅ = coding×6 + test-gen×3 共 9 类；其余 11 类不注入） */
export const CODING_STRATEGY_TYPES: readonly TaskType[] = [
  'coding-feature',
  'coding-enhancement',
  'coding-cleanup',
  'coding-refactor',
  'code-quality-simplify',
  'coding-fix',
  'test-gen-contracts',
  'test-gen-journeys',
  'test-gen-scripts',
]

/** Coding Strategy 段（9 类共用程序内容：TDD 推崇 + 外科手术式精确修改 + 模块边界 + 测试分层）。
 *  TDD 一切复杂度常驻（用户裁决：统一采用 TDD，忽略任务复杂度）。 */
export const CODING_STRATEGY_SECTION = `### Coding Strategy
- 推崇 TDD：先从 AC 逐项提取测试要求；RED → 先写失败测试，GREEN → 最小实现，REFACTOR → 保持测试绿的清理。
- 外科手术式修改：只改任务点名的代码——首次编辑前先用 grep/glob 收齐全部改动点清单；禁止边搜边改。
- 模块边界：尊重既有模块/包的职责划分；除非任务确有必要，不新增模块/包；新代码落在改动点所属的既有包内。
- 红线：业务代码不得混入公共包/框架性代码——发现既有越界只记录上报，不顺手迁移。
- 测试分层：非 gate 的代码触及类任务只跑本类质量门禁 + 定向测试；全仓测试套件属于 gate 任务的结算面，不在此处。`

/** Testing Strategy 段（test-gen 族 ×3 共享程序内容——契约+旅程双轨方法论；红时不改被测代码） */
export const TESTING_STRATEGY_SECTION = `### Testing Strategy
- 方法论：契约 + 用户旅程双轨，两者均从需求拆解而来——用户故事（AC/PRD）是推导重点：契约测试从接口契约推导，旅程测试从用户旅程推导；先定用例、再落脚本。
- 用例与脚本分离：测试用例是文档（清单/表格，逐条可判 PASS/FAIL），测试脚本是代码（可执行自动化）——两者不混写，用例未定不写脚本。
- 只新增或修改任务点名的测试文件；测试失败时修测试，绝不改被测代码。
- 测试无法转绿时先归因：测试自身缺陷则修测试；若被测行为或环境与 AC 冲突，保持测试原样红，以 result=blocked 上报——不为变绿而弱化断言。`

// ─────────────────────── 复杂度保底门（程序段——档案编辑不可触） ───────────────────────

/** 保底门（类型检查/构建 + 改动文件 lint + 定向单测；命令 agent 自选，禁固定 just 配方） */
export function baselineGate(complexity: PersonaComplexity): string {
  const items =
    complexity === 'low'
      ? `1. 改动包的类型检查——本次收窄为仅改动包，不含依赖它的包
2. 改动文件 lint
3. 改动包/模块的定向单元测试——本项必须完整执行`
      : `1. 受影响包的类型检查/构建，含直接依赖它的包
2. 改动文件 lint
3. 改动包/模块的定向单元测试（用该测试框架的原生命令）`
  return `根据本次任务的改动范围，自行构造最合适的验证命令：选对目标包与命令形态——不得机械套用固定的命令配方。
${items}`
}

// ─────────────────────── 档案人格段（claim 链注入取用面取得） ───────────────────────

/**
 * 专家档案投影（claim 链档案取用面注入——ForgeExpertProfile 收窄：persona 组装所需
 * 最小字段集）。title 缺席回落 name（档案规范 title 必填，缺席 = 非规范档案兜底）。
 */
export interface ExpertPersonaProfile {
  readonly name: string
  readonly title?: string
  readonly personaMd: string
}

/** 档案人格段（身份头 + personaMd 正文——职责/边界/信条三段，type 级人格内容承载面） */
export function renderExpertProfileSection(profile: ExpertPersonaProfile): string {
  const title = profile.title ?? profile.name
  const gap = /^[A-Za-z]/.test(title) ? ' ' : ''
  return `你是${gap}${title}。\n\n${profile.personaMd}`
}

// ─────────────────────── persona 合成（纯函数零 IO） ───────────────────────

/** 出口插值防护（上游严格插值——persona 文本禁裸 `{{`，违者抛错而非放行） */
export function assertNoBareInterpolation(persona: string, origin: string): void {
  if (persona.includes('{{')) {
    throw new Error(`${origin}: persona text must not contain bare '{{' (strict upstream interpolation)`)
  }
}

function assertKnownTaskType(taskType: TaskType): void {
  if (!TASK_TYPES.includes(taskType)) {
    throw new Error(`composePersona: unknown task type: ${String(taskType)}`)
  }
}

function assertKnownComplexity(complexity: PersonaComplexity): void {
  if (!(['low', 'medium', 'high'] as readonly string[]).includes(complexity)) {
    throw new Error(`composePersona: unknown complexity: ${String(complexity)}`)
  }
}

/**
 * forge 程序段渲染（纯函数零 IO）：恒定核心段 + Coding/Testing Strategy 共享段 +
 * 复杂度保底门。类型级人格内容（title/creed/gate 指引/workflow 叙述）不在本函数——
 * 由档案人格段承载（composePersonaWithProfile 组装）；程序段一切类型同构，仅
 * 复杂度分级与策略段路由（9 类）有差异。产出文本禁裸 `{{`。taskType 与 complexity
 * 均运行期校验，违者抛错。
 */
export function composePersona(taskType: TaskType, complexity: PersonaComplexity): string {
  assertKnownTaskType(taskType)
  assertKnownComplexity(complexity)
  const sections = [
    PERSONA_CORE_SECTION,
    ...(CODING_STRATEGY_TYPES.includes(taskType)
      ? [taskType.startsWith('test-gen') ? TESTING_STRATEGY_SECTION : CODING_STRATEGY_SECTION]
      : []),
    `## 质量门禁\n${baselineGate(complexity)}`,
  ]
  const persona = sections.join('\n\n')
  assertNoBareInterpolation(persona, 'composePersona')
  return persona
}

/**
 * 完整 worker persona 合成（纯函数零 IO）：档案人格段（身份头 + personaMd——type 级
 * 人格内容）+ forge 程序段（composePersona——核心纪律/共享策略/复杂度保底门）。
 * 档案取用经 claim 链注入面（键来自 settings 映射），本函数只组装。产出文本禁裸 `{{`
 * （含档案正文——用户编辑面同样受上游插值防护约束，违者抛错）。
 */
export function composePersonaWithProfile(
  profile: ExpertPersonaProfile,
  taskType: TaskType,
  complexity: PersonaComplexity,
): string {
  assertKnownTaskType(taskType)
  assertKnownComplexity(complexity)
  const persona = [renderExpertProfileSection(profile), composePersona(taskType, complexity)].join('\n\n')
  assertNoBareInterpolation(persona, 'composePersonaWithProfile')
  return persona
}
