// dsh 依赖统一契约（forge-aggregate-bundle 1.12）：六件插件 package.json 的 dsh 相关
// 依赖单一版本集断言——逐依赖名扫描 peerDependencies / dependencies / devDependencies
// 三面，同名依赖多面出现版本不一致即红（漂移即红）；并锚定当前共识版本集（dsh 官方件
// 0.2.2-rc.5 @ d593e5270b = 官方仓 HEAD 对应 release，npm 同版可装；cordis 4.1.0；
// 构建链 esbuild 0.2xx/typescript/@types 取仓内共识版）。例外：dsh-subagent-in-process-
// driver npm 未发布 0.2.2-rc.5（最高 0.2.1-alpha.1），锚其最新 rc = 0.2.0-rc.2。
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SIX_PACKAGES = [
  "plugins/forge/package.json",
  "plugins/project/package.json",
  "plugins/spec/package.json",
  "plugins/task-loop/package.json",
  "plugins/expert-squad/package.json",
  "plugins/knowledge/package.json",
] as const;

const DEP_SECTIONS = ["peerDependencies", "dependencies", "devDependencies"] as const;

// dsh 相关依赖名前缀：cordis peer、@deepseek-ai/* 官方件（含 dsh-*、schemastery）。
// 构建链 esbuild/typescript/@types/* 由 CANONICAL_VERSIONS 显式锚定。
const DSH_DEP_RE = /^(@deepseek-ai\/|@deepseek-ai\/cordis$)/;

const CANONICAL_VERSIONS: Record<string, string> = {
  "@deepseek-ai/cordis": "4.1.0",
  "@deepseek-ai/schemastery": "3.18.4",
  "esbuild": "0.24.2",
  "typescript": "6.0.3",
  "@types/node": "24.19.0",
};

// dsh 官方件（@deepseek-ai/dsh-*）统一版本锚；npm 无此版的包走 PER_PACKAGE_LATEST_RC 例外。
const DSH_OFFICIAL_PIN = "0.2.2-rc.5";
const PER_PACKAGE_LATEST_RC: Record<string, string> = {
  // npm versions 最高 0.2.1-alpha.1，无 0.2.2-rc.5——锚该包已发布最新 rc。
  "@deepseek-ai/dsh-subagent-in-process-driver": "0.2.0-rc.2",
};

type PkgJson = Partial<Record<(typeof DEP_SECTIONS)[number], Record<string, string>>>;

function loadPkg(rel: string): PkgJson {
  return JSON.parse(readFileSync(join(REPO_ROOT, rel), "utf8")) as PkgJson;
}

interface Occurrence {
  pkg: string;
  section: string;
  version: string;
}

function collectOccurrences(): Map<string, Occurrence[]> {
  const byDep = new Map<string, Occurrence[]>();
  for (const rel of SIX_PACKAGES) {
    const pkg = loadPkg(rel);
    for (const section of DEP_SECTIONS) {
      for (const [name, version] of Object.entries(pkg[section] ?? {})) {
        const isDshOfficial = DSH_DEP_RE.test(name) || name.startsWith("@deepseek-ai/dsh-");
        const isBuildChain = name in CANONICAL_VERSIONS;
        if (!isDshOfficial && !isBuildChain) continue;
        const list = byDep.get(name) ?? [];
        list.push({ pkg: rel, section, version });
        byDep.set(name, list);
      }
    }
  }
  return byDep;
}

describe("dsh 依赖单一版本集（六件统一契约）", () => {
  const byDep = collectOccurrences();

  it("扫描面非空且覆盖六件（每件至少一项 dsh 相关依赖）", () => {
    expect(byDep.size).toBeGreaterThan(0);
    for (const rel of SIX_PACKAGES) {
      const deps = [...byDep.values()].flat().filter((o) => o.pkg === rel);
      expect(deps.length, `${rel} 无 dsh 相关依赖？`).toBeGreaterThan(0);
    }
  });

  it("同名依赖全仓同版（任一面漂移即红）", () => {
    const drifted: string[] = [];
    for (const [name, occs] of byDep) {
      const versions = new Set(occs.map((o) => o.version));
      if (versions.size > 1) {
        drifted.push(
          `${name}: ${[...versions].map((v) => `${v} (${occs.filter((o) => o.version === v).map((o) => `${o.pkg}/${o.section}`).join(", ")})`).join(" vs ")}`,
        );
      }
    }
    expect(drifted, `版本漂移 ${drifted.length} 项:\n${drifted.join("\n")}`).toEqual([]);
  });

  it("dsh 官方件锚 0.2.2-rc.5（npm 无同版包按 PER_PACKAGE_LATEST_RC 例外锚最新 rc）", () => {
    const offPin: string[] = [];
    for (const [name, occs] of byDep) {
      if (!name.startsWith("@deepseek-ai/dsh-")) continue;
      const expected = PER_PACKAGE_LATEST_RC[name] ?? DSH_OFFICIAL_PIN;
      for (const o of occs) {
        if (o.version !== expected) {
          offPin.push(`${name} @ ${o.pkg}/${o.section}: ${o.version} ≠ ${expected}`);
        }
      }
    }
    expect(offPin, `官方件版本偏离锚:\n${offPin.join("\n")}`).toEqual([]);
  });

  it("cordis peer 与构建链锚共识版", () => {
    const offPin: string[] = [];
    for (const [name, expected] of Object.entries(CANONICAL_VERSIONS)) {
      for (const o of byDep.get(name) ?? []) {
        if (o.version !== expected) {
          offPin.push(`${name} @ ${o.pkg}/${o.section}: ${o.version} ≠ ${expected}`);
        }
      }
    }
    expect(offPin, `cordis/构建链版本偏离锚:\n${offPin.join("\n")}`).toEqual([]);
  });

  it("六件 cordis peerDependencies 全部在位且同版", () => {
    const offPin: string[] = [];
    for (const rel of SIX_PACKAGES) {
      const peer = loadPkg(rel).peerDependencies?.["@deepseek-ai/cordis"];
      if (peer !== CANONICAL_VERSIONS["@deepseek-ai/cordis"]) {
        offPin.push(`${rel}: peer cordis = ${peer ?? "（缺）"}`);
      }
    }
    expect(offPin, `cordis peer 面:\n${offPin.join("\n")}`).toEqual([]);
  });

  // 判例 fc07cd8d（forge-aggregate-bundle 1.20）：dependencies 里的 @deepseek-ai/* 是
  // bundle 通道污染源——desktop staging autoInstallPeers 沿其 peer 族整树拉入对应代际
  // 官方件（driver@0.2.0-rc.2 → 旧代际六件 + better-sqlite3@11.x node-gyp → ELIFECYCLE 1）。
  // 官方内部件一律「内联进 dist + 声明迁 devDependencies」；白名单仅当前代际类型面单件
  // dsh-typert-protocol（无 peer 族、无 install 脚本——非污染源）。
  it("六件 dependencies 禁 @deepseek-ai/*（bundle 通道污染源根除——白名单 dsh-typert-protocol）", () => {
    const whitelist = new Set(["@deepseek-ai/dsh-typert-protocol"]);
    const offenders: string[] = [];
    for (const rel of SIX_PACKAGES) {
      for (const [name] of Object.entries(loadPkg(rel).dependencies ?? {})) {
        if (name.startsWith("@deepseek-ai/") && !whitelist.has(name)) {
          offenders.push(`${rel}: dependencies 含 ${name}`);
        }
      }
    }
    expect(offenders, `dependencies 官方件残留:\n${offenders.join("\n")}`).toEqual([]);
  });
});
