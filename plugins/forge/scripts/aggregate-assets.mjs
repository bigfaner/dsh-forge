// aggregate-assets.mjs — forge 资产/工件构建期物化脚本（forge-deep-pack 1.14 返工裁定；
// build 链末步自动执行，全部 run-once、幂等可重跑）：
//   ① 五件 skills/ 构建期复制 → forge/dist/skills/<member>/（生成物随 dist，不进 git
//      ——每次构建从五件源包最新产物重新物化，freshness 门天然覆盖）；
//   ② experts/ 布局同构重定位 → forge 包根 experts/（P0 #4——expert-squad 内联五件
//      host 入口时 dist/host → ../../experts/ 层级恰好同构，原 import.meta.url 表达式
//      零改写成立；漂移 = ENOENT 静默空返回。落点受 scan.ts 锚定约束不可挪 dist；
//      生成物不进 git——.gitignore 与 dist 同等地位，package.json files 白名单收录
//      保 tgz 发布面）；
//   ③ cordis.patch.yml preset-standard 覆写行同源再生成（customSkillDirs 五条全自锚
//      ——判例：skills 挂载 = preset-standard 覆写行 config 锚，非插行扫描）；
//   ④ 构建闭包守卫：断言当前 dist 无下游内联五件 host 入口（external 档现状），
//      且一旦出现内联痕迹（../../experts/ 字面量）experts 聚合必须已同构在位。
// 聚合产物（dist/skills/ experts/）为构建生成物不进 git；cordis.patch.yml 为提交面
// 正本（脚本再生成，漂移由 tests/forge/asset-aggregation.test.ts 守卫红）。
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(FORGE_ROOT, "..", "..");
const MEMBERS = ["project", "spec", "task-loop", "expert-squad", "knowledge"];

// skills 自锚表达式（与 host/assembly.ts skillDirSelfAnchorExpr 同源——静态双检
// tests/forge/asset-aggregation.test.ts 逐字符比对，漂移即红；.mjs 不 import .ts，
// 双写由双检钉死）。聚合落点 = 包内 dist/skills/<member>/（构建生成物）。
const anchorExpr = (member) =>
  `process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@dsh-forge/forge/package.json')), 'dist', 'skills', '${member}')`;

// home 表达式（与 host/assembly.ts DSH_HOME_ENV/FORGE_HOME_SUFFIX 同源——derive-configs
// 静态双检钉死）。
const HOME_EXPR = `process.env.DSH_HOME && (process.env.DSH_HOME + '/forge')`;

/** 递归枚举相对文件集（资产一致性比对用）。 */
function walkRel(dir, root = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkRel(full, root));
    else out.push(resolve(full).slice(resolve(root).length + 1).replaceAll("\\", "/"));
  }
  return out.sort();
}

// ── ① 五件 skills 构建期复制 → forge/dist/skills/<member>/ ──────────────────
const skillsRoot = join(FORGE_ROOT, "dist", "skills");
rmSync(skillsRoot, { recursive: true, force: true });
for (const member of MEMBERS) {
  const source = join(REPO_ROOT, "plugins", member, "skills");
  const dest = join(skillsRoot, member);
  mkdirSync(dest, { recursive: true });
  if (existsSync(source)) cpSync(source, dest, { recursive: true });
  console.log(`[aggregate] dist/skills/${member}: ${walkRel(dest).length} 件`);
}

// ── ② experts 布局同构重定位 → forge 包根 experts/（生成物不进 git）─────────
const expertsRoot = join(FORGE_ROOT, "experts");
rmSync(expertsRoot, { recursive: true, force: true });
cpSync(join(REPO_ROOT, "plugins", "expert-squad", "experts"), expertsRoot, { recursive: true });
console.log(`[aggregate] experts: ${walkRel(expertsRoot).length} 件`);

// ── ③ cordis.patch.yml 再生成（forge 单行自插 + skill-filesystem + preset-standard）──
// preset-standard 覆写子树源锚 = spec 包既有生成产物（plugins/spec/cordis.patch.yml
// ——由 spec/scripts/gen-preset-standard-overlay.mjs 从官方 dsh-web-app 底稿生成）。
// 官方底稿更新后先重跑 spec 生成脚本，再重跑本脚本——forge 面不直接锚官方安装树，
// 生成链单源不双轨。
const specPatch = readFileSync(join(REPO_ROOT, "plugins", "spec", "cordis.patch.yml"), "utf8").replaceAll("\r\n", "\n");
const presetAt = specPatch.indexOf("- id: preset-standard");
if (presetAt < 0) throw new Error("aggregate-assets: spec cordis.patch.yml 缺 preset-standard 块——生成链漂移");
// 幂等 + 三档通吃：剥掉全部 @dsh-forge/* 跨包锚（上次 forge 自锚行 + spec 面遗留的
// spec 包锚——deep tgz 档五件包不可解析，MODULE_NOT_FOUND 无 fail-soft，正是 P0 #5
// 三硬前提要根除的面），再按序补五条 forge 自锚。官方 dsh-agent-preset 锚保留（宿主
// 壳层恒在场，非跨插件包）。
const presetBlock = specPatch
  .slice(presetAt)
  .replace(/\n+$/, "")
  .split("\n")
  .filter((line) => !line.includes("resolve('@dsh-forge/"))
  .join("\n");
// 嵌套 skill-filesystem 行的 customSkillDirs 列表尾追加五条自锚（缩进 12 列 '- '）。
const presetLines = presetBlock.split("\n");
const dirsAt = presetLines.findIndex((line) => line === "          customSkillDirs:");
if (dirsAt < 0) throw new Error("aggregate-assets: preset 块缺嵌套 customSkillDirs 行——官方底稿形状漂移");
let insertAt = dirsAt + 1;
while (insertAt < presetLines.length && presetLines[insertAt].startsWith("            - ")) insertAt += 1;
presetLines.splice(insertAt, 0, ...MEMBERS.map((m) => `            - !!js ${anchorExpr(m)}`));

const anchorLines = MEMBERS.map((m) => `      - !!js ${anchorExpr(m)}`);
const patchYaml = [
  "# @dsh-forge/forge 资产挂载 patch（forge-deep-pack 1.14——scripts/aggregate-assets.mjs 生成产物，勿手改）：",
  "# ① forge 单行自插（1.4 裁定沿袭）：五件零插行，一律经 host apply 组合激活；",
  "#    config 行 = { home } 唯一键（延伸常量同源物化——assembly.ts 静态双检锚）。",
  "# ② skills 挂载 = preset-standard 覆写行 customSkillDirs config 锚（判例：非插行",
  "#    扫描；dsh-web-app 将顶层 skill-filesystem 行 disabled，预设会话由预设行内实例",
  "#    供服）。customSkillDirs 五条全自锚（resolve('@dsh-forge/forge/package.json')",
  "#    单表达式——跨包锚三硬前提根除，三档通吃），聚合面 = forge/dist/skills/<member>/",
  "#    （构建期物化生成物，不进 git——每次构建从五件源包最新产物重新复制）。",
  "# ③ preset-standard 子树逐字保留 spec 面生成产物（官方底稿生成链单源），仅在嵌套",
  "#    skill-filesystem 行追加五条自锚；重生成 = 先跑 spec 生成脚本再跑本脚本。",
  "- insert:",
  "    - id: forge",
  "      name: '@dsh-forge/forge'",
  "      config:",
  `        home: !!js ${HOME_EXPR}`,
  "- id: skill-filesystem",
  "  name: '@deepseek-ai/dsh-skill-filesystem'",
  "  config:",
  "    customSkillDirs:",
  ...anchorLines,
  ...presetLines,
].join("\n");
writeFileSync(join(FORGE_ROOT, "cordis.patch.yml"), patchYaml + "\n", "utf8");
console.log(`[aggregate] cordis.patch.yml 再生成（forge 自插 + skill-filesystem 五自锚 + preset-standard 覆写）`);

// ── ④ 构建闭包守卫（P0 #4）─────────────────────────────────────────────────
const violations = [];
if (!existsSync(expertsRoot)) violations.push("experts/ 聚合缺席——内联档 ../../experts/ 将 ENOENT 静默空返回");
// 布局同构锚（路径数学断言）：dist/host/*.js 的 import.meta.url → ../../experts/ 恰落 forge 包根。
const distHost = join(FORGE_ROOT, "dist", "host");
const expectedExperts = resolve(distHost, "..", "..", "experts");
if (resolve(expertsRoot) !== expectedExperts) violations.push(`experts 布局不同构：${expertsRoot} ≠ ${expectedExperts}`);
// 资产新鲜度守卫：聚合体文件集 ≠ 五件源 → 漂移（须重跑本脚本——build 链末步自动重物化）。
for (const member of MEMBERS) {
  const source = join(REPO_ROOT, "plugins", member, "skills");
  const dest = join(skillsRoot, member);
  const srcSet = walkRel(source).filter((f) => f !== ".gitkeep");
  const destSet = walkRel(dest).filter((f) => f !== ".gitkeep");
  if (JSON.stringify(srcSet) !== JSON.stringify(destSet)) {
    violations.push(`dist/skills/${member} 聚合漂移（源 ${srcSet.length} 件 vs 聚合 ${destSet.length} 件）——重跑本脚本`);
  }
}
const expertSrc = join(REPO_ROOT, "plugins", "expert-squad", "experts");
if (JSON.stringify(walkRel(expertSrc)) !== JSON.stringify(walkRel(expertsRoot))) {
  violations.push("experts 聚合漂移（≠ expert-squad/experts）——重跑本脚本");
}
// 下游内联痕迹扫描：dist/host 出现 expert-squad 内联代码特征（../../experts/ 字面量）
// 时，experts 聚合必须同构在位（否则漂移静默丢失——P0 #4 反例）；当前 external 档
// 应零内联（五件 host 入口由宿主 node_modules 解析）。
if (existsSync(distHost)) {
  let inlineHit = false;
  for (const name of readdirSync(distHost)) {
    if (!name.endsWith(".js")) continue;
    const text = readFileSync(join(distHost, name), "utf8");
    if (text.includes('"../../experts/"') || text.includes("'../../experts/'")) inlineHit = true;
  }
  if (inlineHit) {
    console.log("[aggregate] dist/host 检出五件内联痕迹（inline 档）——experts 同构在位断言已满足");
  } else {
    console.log("[aggregate] dist/host 零内联痕迹（external 档现状守卫通过——无下游内联五件 host 入口）");
  }
}
if (violations.length > 0) {
  console.error(`[aggregate] 闭包守卫 ${violations.length} 处违规：`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log("[aggregate] 全部完成（dist/skills 五件 + experts 同构 + patch 再生成 + 闭包守卫通过）");
