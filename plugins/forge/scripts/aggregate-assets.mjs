// aggregate-assets.mjs — bundle 档单一生成器（forge-aggregate-bundle 1.5——提案 §二
// patch 面定谳形态）：唯一产物 = cordis.patch.yml，由成员清单（MEMBERS）单源驱动再
// 生成（run-once、幂等可重跑；提交面正本，漂移由 tests/forge/patch-generator.test.ts
// 守卫红）。deep 单行自插/资产聚合面随 deep 通道退役删除（forge-aggregate-bundle 1.7）。
//
// freshness 代际守卫入口前置（forge-aggregate-bundle 1.7——freshness 门自 deep-build
// 迁入 bundle 打包链）：本脚本是 forge build 链末步，dist 刚由前置步产出——入口只做
// 代际双校验（不再递归编译；全量自动编译门归 package-release assembleRelease 前置）。
//
// patch 面（提案 §二.2/§2.3）：
//   ① 六插行：forge 自插行（{ home } 唯一键——Workbench 生长面，§2.2）+ 五件插行
//      各携带派发 config !!js 行——派发映射消费 host/assembly.ts derivePluginConfigs
//      单源（bundle 档唯一输入 = DSH_HOME 缺省派生分支；静态双检防漂移）；
//   ② 五件顶层 skills 行（探针④分支 A）：异 id（≠ 官方 base 行——fefd5149 定点
//      disable）+ 互异 providerName（默认名同层重名 loud-fail）+ customSkillDirs
//      自锚本包 skills/；
//   ③ preset-forge 行（§2.1）：persona 前缀（forge 流水线作业 SOP）+ 官方工具集
//      standard 同构裁剪（base skill-filesystem 行由行内 forge 实例替换）+ 行内
//      skill-filesystem-forge 实例（五条已装包锚）；order 定值 = 官方仓 preset 底稿
//      核销当前 order 全集（packages/bundle/web-app/presets/：standard=1、ptc=2、
//      minimal=3、cordis=4）后定值 2，官方升级随真机批次复校——漂移可发现而非被
//      吸收（圆桌裁决 2026-11-21）。
// 生成器不变量：全部派发表达式自带 && 短路兜底（防裸表达式异常冒泡打断行激活——
// 圆桌裁定），写入前自检断言、契约测试 pin。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generationViolations } from "./freshness.mjs";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── freshness 代际守卫入口前置（fail-loud——dist 陈旧即中止，不产漂移 patch）──
const generationDrift = generationViolations("@dsh-forge/forge", FORGE_ROOT);
if (generationDrift.length > 0) {
  console.error("[aggregate] freshness 代际守卫违规：");
  for (const v of generationDrift) console.error(`  - ${v}`);
  process.exit(1);
}

// ── 成员清单单源（六插行/五 skills 行/preset 五锚全部由本清单驱动）──────────
const MEMBERS = ["project", "spec", "task-loop", "expert-squad", "knowledge"];

// ── 延伸常量（与 host/assembly.ts 同源——静态双检钉死，.mjs 不 import .ts）──
const DSH_HOME_ENV = "DSH_HOME";
const FORGE_HOME_SUFFIX = "/forge";
const DB_RELATIVE = "/db/forge/forge.db";
const TASKS_RELATIVE = "/projects";

// order 定值（官方仓 preset 底稿核销后定值——契约断言 pin，漂移红）
const PRESET_FORGE_ORDER = 2;

const DSH = `process.env.${DSH_HOME_ENV}`;
const HOME_EXPR = `${DSH} && (${DSH} + '${FORGE_HOME_SUFFIX}')`;
const DB_EXPR = `${DSH} && (${DSH} + '${FORGE_HOME_SUFFIX}${DB_RELATIVE}')`;
const TASKS_EXPR = `${DSH} && (${DSH} + '${FORGE_HOME_SUFFIX}${TASKS_RELATIVE}')`;
const PROJECT_HOME_EXPR = `${DSH} && ${DSH}`;

// 五件 skills 自锚表达式（自锚本包 skills/——每件只依赖自己，&& 短路兜底；与
// plugins/expert-squad/cordis.patch.yml 1.4 落定形态同构）。
const memberSkillAnchorExpr = (member) =>
  `process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@dsh-forge/${member}/package.json') && process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@dsh-forge/${member}/package.json')), 'skills')`;

// 五件派发 config（镜像 assembly.ts derivePluginConfigs({} , env) 缺省派生分支：
// db → 四持库件统一 dbFile、tasksHome 透传 task-loop、expert-squad 空对象豁免）。
const DISPATCH_CONFIGS = {
  project: { home: PROJECT_HOME_EXPR, dbFile: DB_EXPR },
  spec: { dbFile: DB_EXPR },
  "task-loop": { dbFile: DB_EXPR, tasksHome: TASKS_EXPR },
  "expert-squad": {},
  knowledge: { dbFile: DB_EXPR },
};

// ── preset-forge 行（persona SOP + standard 同构裁剪 + 行内 forge 技能实例）──
const PRESET_FORGE_PERSONA = `You are a coding agent powered by the {{model}} model.
你是 forge 流水线作业模式（Forge模式）：按任务规格交付的资深全栈工程师。
作业纪律：动手前先读任务规格与锚点文档，拆成待办清单逐项推进；以 TDD 小步快跑——先从验收标准提取测试要求，再最小实现到交付；规格是唯一事实源，不扩大改动面、不顺带重构。
一切跑批与证据产物统一落盘存档，先落盘再继续；收口前逐项核对验收标准并如实上报，门禁与测试证据零伪造、红就是红。
遇歧义：低风险假设声明后继续，重大歧义停下上报，不原地等待；遇失败先分类归因，同一失败方案不反复重试。`;

const presetForgeBlock = [
  "- id: preset-forge",
  "  name: '@deepseek-ai/dsh-agent-preset'",
  "  config:",
  `    id: forge`,
  `    name: Forge模式`,
  `    description: "forge 流水线作业预设：任务规格驱动的全栈交付模式（拆解/TDD/落盘取证/门禁收口）。"`,
  `    order: ${PRESET_FORGE_ORDER}`,
  "    plugins:",
  "      - id: persona",
  "        name: '@deepseek-ai/dsh-persona'",
  "        config:",
  "          prefix: >-",
  ...PRESET_FORGE_PERSONA.split("\n").map((line) => `            ${line}`),
  // ── 官方工具集 standard 同构裁剪（plugins/spec/cordis.patch.yml preset-standard
  //    子树逐字形态；base skill-filesystem 行由行内 skill-filesystem-forge 实例替换）──
  "      - id: agent-instructions",
  "        name: '@deepseek-ai/dsh-agent-instructions'",
  "        config:",
  "          maxBytes: 65536",
  "      - id: time-context",
  "        name: '@deepseek-ai/dsh-time-context'",
  "      - id: tool-bash",
  "        name: '@deepseek-ai/dsh-tool-bash'",
  "        disabled: !!js process.platform === 'win32'",
  "      - id: tool-pwsh",
  "        name: '@deepseek-ai/dsh-tool-pwsh'",
  "        disabled: !!js process.platform !== 'win32'",
  "      - id: tool-fs",
  "        name: '@deepseek-ai/dsh-tool-fs'",
  "        config:",
  "          # Set false to drop the apply_patch tool beside edit.",
  "          applyPatch: false",
  "      - id: tool-fs-search",
  "        name: '@deepseek-ai/dsh-tool-fs-search'",
  "        config:",
  "          sampleOverCapGlobResults: false",
  "      - id: tool-jobs",
  "        name: '@deepseek-ai/dsh-tool-jobs'",
  "      - id: tool-schedule",
  "        name: '@deepseek-ai/dsh-tool-schedule'",
  "      - id: skill-filesystem-forge",
  "        name: '@deepseek-ai/dsh-skill-filesystem'",
  "        config:",
  "          providerName: filesystem-forge",
  "          customSkillDirs:",
  ...MEMBERS.map((m) => `            - !!js ${memberSkillAnchorExpr(m)}`),
  "      - id: tool-skill",
  "        name: '@deepseek-ai/dsh-tool-skill'",
  "      - id: command-goal",
  "        name: '@deepseek-ai/dsh-command-goal'",
  "      - id: tool-goal",
  "        name: '@deepseek-ai/dsh-tool-goal'",
  "      - id: planning",
  "        name: cordis:group",
  "        group: true",
  "        isolate:",
  "          planMode: true",
  "        config:",
  "          - id: plan-mode",
  "            name: '@deepseek-ai/dsh-plan-mode'",
  "            config:",
  "              section: |",
  ...[
    "You are in plan mode. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.",
    "Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.",
    "The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.",
    "Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.",
    "Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.",
    "When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask \"should I proceed?\" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.",
  ].map((line) => `                ${line}`),
  "      - id: compaction",
  "        name: cordis:group",
  "        group: true",
  "        isolate:",
  "          compaction: true",
  "          toolResultPruner: true",
  "        config:",
  "          - id: compaction-basic",
  "            name: '@deepseek-ai/dsh-compaction-basic'",
  "          - id: command-compact",
  "            name: '@deepseek-ai/dsh-command-compact'",
  "          - id: tool-result-pruner",
  "            name: '@deepseek-ai/dsh-compaction-tool-result-pruner'",
  "            config:",
  "              thresholdChars: 8192",
  "              headChars: 4096",
  "              tailChars: 1024",
  "      - id: delegation",
  "        name: cordis:group",
  "        group: true",
  "        isolate:",
  "          workflowEngine: true",
  "        config:",
  "          - id: tool-subagent-control",
  "            name: '@deepseek-ai/dsh-tool-subagent-control'",
  "            config:",
  "              interrupt: false",
  "          - id: tool-subagent",
  "            name: '@deepseek-ai/dsh-tool-subagent'",
  "            config:",
  "              provider: spawn",
  "              toolName: subagent",
  "              modelSelection: true",
  "              modelDiscovery: true",
  "          - id: tool-subagent-fork",
  "            name: '@deepseek-ai/dsh-tool-subagent'",
  "            config:",
  "              provider: fork",
  "              toolName: subagent_fork",
  "          - id: workflow-ptc",
  "            name: '@deepseek-ai/dsh-workflow-ptc'",
  "            config:",
  "              provider: spawn",
  "          - id: tool-workflow",
  "            name: '@deepseek-ai/dsh-tool-workflow'",
  "      - id: tool-ask-user",
  "        name: '@deepseek-ai/dsh-tool-ask-user'",
  "      - id: tool-todo",
  "        name: '@deepseek-ai/dsh-tool-todo'",
  "        config:",
  "          allowParallelInProgress: true",
  "      - id: tool-web",
  "        name: '@deepseek-ai/dsh-tool-web'",
  "        config:",
  "          fetch: true",
  "          searchTimeoutMs: 60000",
  "      - id: present",
  "        name: '@deepseek-ai/dsh-tool-present'",
  "      - id: tool-office",
  "        name: '@deepseek-ai/dsh-tool-office'",
  "      - id: tool-plugin-manager",
  "        name: '@deepseek-ai/dsh-plugin-manager/tools'",
  "        disabled: !!js \"!ctx.get('profileContext')\"",
  "      - id: tool-plugin-market",
  "        name: '@deepseek-ai/dsh-plugin-market/tools'",
  "        disabled: true",
];

// ── 生成器自检断言（不变量写入前自证——违规 fail-loud 不产文件）────────────
function selfCheck(patchYaml) {
  const violations = [];
  // 六插行：id 序 = forge + 五件（成员清单单源序）
  const insertIds = [...patchYaml.matchAll(/^    - id: (.+)$/gm)].map((m) => m[1]);
  const expectedInsertIds = ["forge", ...MEMBERS];
  if (JSON.stringify(insertIds) !== JSON.stringify(expectedInsertIds)) {
    violations.push(`六插行 id 序漂移：${JSON.stringify(insertIds)} ≠ ${JSON.stringify(expectedInsertIds)}`);
  }
  // 全部派发/锚定表达式 && 短路兜底（生成器不变量——preset 官方底稿表达式不属派发面）
  const dispatchExprs = [HOME_EXPR, DB_EXPR, TASKS_EXPR, PROJECT_HOME_EXPR, ...MEMBERS.map(memberSkillAnchorExpr)];
  const unguarded = dispatchExprs.filter((p) => !p.includes("&&"));
  if (unguarded.length > 0) violations.push(`派发表达式缺 && 短路兜底：${JSON.stringify(unguarded)}`);
  // 五 skills 行三谓词：id 互异 ∩ ≠ base id ∩ providerName 互异 ≠ 默认名
  const skillIds = MEMBERS.map((m) => `skill-filesystem-${m}`);
  if (new Set(skillIds).size !== MEMBERS.length) violations.push("skills 行 id 非互异");
  if (skillIds.includes("skill-filesystem")) violations.push("skills 行 id 撞官方 base id");
  const providerNames = MEMBERS.map((m) => `filesystem-${m}`);
  if (new Set(providerNames).size !== MEMBERS.length) violations.push("providerName 非互异");
  if (providerNames.includes("filesystem")) violations.push("providerName 撞默认名");
  // 负断言：零裸 filesystem 行（顶层 skills 行一律显式 providerName）
  const bareRows = [...patchYaml.matchAll(/^- id: (skill-filesystem\S*)$/gm)]
    .map((m) => m[1])
    .filter((id) => id === "skill-filesystem");
  if (bareRows.length > 0) violations.push("patch 出现官方 base id 裸 filesystem 行");
  // order pin
  if (!patchYaml.includes(`    order: ${PRESET_FORGE_ORDER}`)) {
    violations.push(`preset-forge order ≠ 定值 ${PRESET_FORGE_ORDER}`);
  }
  if (violations.length > 0) {
    console.error(`[aggregate] 自检断言 ${violations.length} 处违规：`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
}

// ── 组装 + 写盘 ────────────────────────────────────────────────────────────
const insertBlock = [
  "- insert:",
  "    - id: forge",
  "      name: '@dsh-forge/forge'",
  "      config:",
  `        home: !!js ${HOME_EXPR}`,
  ...MEMBERS.flatMap((m) => {
    const config = DISPATCH_CONFIGS[m];
    const lines = [`    - id: ${m}`, `      name: '@dsh-forge/${m}'`];
    if (Object.keys(config).length > 0) {
      lines.push("      config:");
      for (const [key, expr] of Object.entries(config)) lines.push(`        ${key}: !!js ${expr}`);
    }
    return lines;
  }),
];

const skillsBlock = MEMBERS.flatMap((m) => [
  `- id: skill-filesystem-${m}`,
  "  name: '@deepseek-ai/dsh-skill-filesystem'",
  "  config:",
  `    providerName: filesystem-${m}`,
  "    customSkillDirs:",
  `      - !!js ${memberSkillAnchorExpr(m)}`,
]);

const header = [
  "# @dsh-forge/forge bundle 档 patch（forge-aggregate-bundle 1.5——scripts/aggregate-assets.mjs 生成产物，勿手改）：",
  "# ① 六插行：forge 自插行（{ home } 唯一键——Workbench 生长面）+ 五件插行各携带派发",
  "#    config !!js 行（映射 host/assembly.ts derivePluginConfigs 单源——bundle 档唯一",
  "#    输入 = DSH_HOME 缺省派生分支；静态双检 tests/forge/patch-generator.test.ts）。",
  "# ② 五件顶层 skills 行：异 id（≠ 官方 base 行——fefd5149 定点 disable 判例）+ 互异",
  "#    providerName（默认名同层重名注册 loud-fail）+ customSkillDirs 自锚本包 skills/。",
  "# ③ preset-forge：persona 前缀（forge 流水线作业 SOP）+ 官方工具集 standard 同构裁剪",
  "#    + 行内 skill-filesystem-forge 实例（五条已装包锚）；order 定值 2（官方仓 preset",
  "#    底稿核销当前 order 全集后定值 + 契约断言 pin——官方升级随真机批次复校）。",
  "# 全部派发表达式自带 && 短路兜底（生成器不变量——防裸表达式异常冒泡打断行激活）。",
];

const patchYaml = [...header, ...insertBlock, ...skillsBlock, ...presetForgeBlock].join("\n") + "\n";
selfCheck(patchYaml);
const target = join(FORGE_ROOT, "cordis.patch.yml");
const previous = readFileSync(target, "utf8");
if (previous === patchYaml) {
  console.log("[aggregate] cordis.patch.yml 已是最新（零漂移——再生成幂等）");
} else {
  writeFileSync(target, patchYaml, "utf8");
  console.log("[aggregate] cordis.patch.yml 再生成（六插行 + 五件派发 + 五 skills 行 + preset-forge）");
}
