// freshness.mjs — freshness 自动编译门 + 代际双校验（forge-aggregate-bundle 1.7，自
// deep-build.mjs 退役迁入——freshness 门归属 bundle 打包链，圆桌裁定迁移与删除同提交）。
//
// 门禁语义（R4 用户裁定承袭：不信任任何在盘 dist）：
//   ① freshness 门：按依赖拓扑序逐件 `pnpm -C plugins/<x> build` 自动编译五件 + forge
//      本体（run-once，tsc 增量承担幂等；AGGREGATE_BUILD_SKIP_REBUILD=1 时跳过自动编译
//      步——仅开发迭代形态，代际双校验仍在，在盘 dist 陈旧照样 fail）；
//   ② 代际双校验：产物代际标记（dist/client.js `@dsh-forge-generation:pkg@ver`）==
//      源 package.json version——陈旧即 fail（反例实证：project 源 0.26.4 vs dist
//      0.26.3；自动编译根治 + 代际校验防中途改源）。
// 消费面：scripts/package-release.mjs assembleRelease 入口前置（runFreshnessGate）；
// scripts/aggregate-assets.mjs 入口前置（verifyGeneration 单查——forge build 链末步，
// dist 刚产出，只做代际守卫不再递归编译）。
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { COMPOSED_MEMBERS } from "./self-containment.mjs";

export const SKIP_REBUILD_ENV = "AGGREGATE_BUILD_SKIP_REBUILD";

/** 成员包目录（repoRoot/plugins/<bare>） */
export function memberDir(repoRoot, member) {
  return join(repoRoot, "plugins", member.replace("@dsh-forge/", ""));
}

/** 成员 manifest 读取 */
export function readManifest(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

/**
 * 五件依赖拓扑序（deep-build 同构算法：dependencies 中引用兄弟成员者排在被依赖件之后；
 * 依赖环即 fail）。
 */
export function topoOrder(repoRoot, members = COMPOSED_MEMBERS) {
  const depsOf = new Map(
    members.map((m) => [
      m,
      Object.keys(readManifest(memberDir(repoRoot, m)).dependencies ?? {}).filter((d) => members.includes(d)),
    ]),
  );
  const ordered = [];
  const placed = new Set();
  const visit = (m, seen) => {
    if (placed.has(m)) return;
    if (seen.has(m)) throw new Error(`依赖环：${[...seen, m].join(" → ")}`);
    seen.add(m);
    for (const d of depsOf.get(m)) visit(d, seen);
    seen.delete(m);
    placed.add(m);
    ordered.push(m);
  };
  for (const m of members) visit(m, new Set());
  return ordered;
}

/**
 * 代际双校验：dist/client.js 代际标记 == 源 package.json version + dist/host/index.js
 * 在场。陈旧/漂移即 throw（返回违规消息清单的形态留给测试逐条断言——throw 承载 fail-loud）。
 */
export function generationViolations(label, dir) {
  const violations = [];
  const manifest = readManifest(dir);
  const clientPath = join(dir, "dist/client.js");
  if (!existsSync(clientPath)) {
    violations.push(`${label} 代际校验失败：dist/client.js 缺席（build 链漂移）`);
    return violations;
  }
  const marker = `/* @dsh-forge-generation:${manifest.name}@${manifest.version}*/`;
  const clientText = readFileSync(clientPath, "utf8");
  if (!clientText.includes(marker)) {
    violations.push(
      `${label} 代际校验失败：dist/client.js 代际标记 ≠ 源 package.json version ${manifest.version}` +
        `（陈旧反例实证：源 ${manifest.version} vs dist 在盘标记漂移）——freshness 门 fail`,
    );
  }
  if (!existsSync(join(dir, "dist/host/index.js"))) violations.push(`${label} 代际校验失败：dist/host/index.js 缺席`);
  return violations;
}

/**
 * freshness 门主体：五件拓扑序 + forge 本体逐件自动编译（run-once，禁 watch——AGENTS §2），
 * 随后代际双校验。违规聚合后一次性 fail-loud。返回编译件数（供调用方日志）。
 */
export function runFreshnessGate({ repoRoot, forgeDir, members = COMPOSED_MEMBERS, log = (m) => console.log(`[freshness] ${m}`) } = {}) {
  if (forgeDir === undefined) throw new Error("runFreshnessGate：forgeDir 缺参（forge 包目录）");
  const order = topoOrder(repoRoot, members);
  const dirs = [...order.map((m) => [m, memberDir(repoRoot, m)]), ["@dsh-forge/forge", forgeDir]];
  const skipRebuild = process.env[SKIP_REBUILD_ENV] === "1";
  if (!skipRebuild) {
    for (const [label, dir] of dirs) {
      log(`freshness 门：pnpm -C ${relative(repoRoot, dir) || "."} build（run-once）…`);
      const r = spawnSync("pnpm", ["-C", dir, "build"], { cwd: repoRoot, stdio: "inherit", shell: true });
      if (r.status !== 0) throw new Error(`${label} 自动编译失败（exit ${r.status}）——freshness 门中止`);
    }
  } else {
    log(`${SKIP_REBUILD_ENV}=1——跳过自动编译步（代际双校验仍强制）`);
  }
  const violations = dirs.flatMap(([label, dir]) => generationViolations(label, dir));
  if (violations.length > 0) {
    console.error(`[freshness] 代际双校验 ${violations.length} 处违规：`);
    for (const v of violations) console.error(`  - ${v}`);
    throw new Error("freshness 门 fail（代际双校验违规）");
  }
  for (const [label, dir] of dirs) log(`代际双校验通过：${label}@${readManifest(dir).version}`);
  return dirs.length;
}
