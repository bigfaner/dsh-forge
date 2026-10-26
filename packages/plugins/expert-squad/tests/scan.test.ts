// store/scan 单元测试（tech-design §10.1）：三层遮蔽定序、快照一致性、坏文件隔离、
// root 不可读降级、root 解析（project = cwd 向上至 git 根；user = $DSH_HOME；plugin 随包）。

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  findProjectRoot,
  resolveCwdProjectExpertsRoot,
  resolvePluginExpertsRoot,
  resolveUserExpertsRoot,
  scanExpertRoots,
  type ExpertOrigin,
} from "../src/store/scan.js";

const tmpRoots: string[] = [];

afterAll(async () => {
  await Promise.all(tmpRoots.map((r) => rm(r, { recursive: true, force: true })));
});

async function makeSandbox(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "expert-squad-scan-"));
  tmpRoots.push(dir);
  return dir;
}

/** 建一份合法专家档案。 */
function expertMd(name: string, title: string): string {
  return [
    "---",
    `name: ${name}`,
    `title: "${title}"`,
    "description: test expert",
    "tools: [read]",
    "---",
    `## 职责 ${title}`,
  ].join("\n");
}

/** 建带 .git 标记的项目根 + 嵌套 cwd + project/user/plugin 三层 experts 目录。 */
async function makeThreeLayers() {
  const sandbox = await makeSandbox();
  const projectRoot = join(sandbox, "repo");
  await mkdir(join(projectRoot, ".git"), { recursive: true });
  const cwd = join(projectRoot, "a", "b");
  await mkdir(cwd, { recursive: true });
  const project = join(projectRoot, ".dsh", "experts");
  const user = join(sandbox, "home", "experts");
  const plugin = join(sandbox, "plugin-pkg", "experts");
  for (const d of [project, user, plugin]) await mkdir(d, { recursive: true });
  return { sandbox, projectRoot, cwd, project, user, plugin };
}

function rootsOf(l: { project: string; user: string; plugin: string }): {
  origin: ExpertOrigin;
  dir: string;
}[] {
  return [
    { origin: "project", dir: l.project },
    { origin: "user", dir: l.user },
    { origin: "plugin", dir: l.plugin },
  ];
}

describe("root 解析（D3 三层物理位置）", () => {
  it("findProjectRoot：cwd 向上解析至含 .git 的根", async () => {
    const l = await makeThreeLayers();
    expect(findProjectRoot(l.cwd)).toBe(l.projectRoot);
  });

  it("findProjectRoot：无 .git 祖先 → null", async () => {
    const dir = await makeSandbox();
    expect(findProjectRoot(dir)).toBeNull();
  });

  it("resolveUserExpertsRoot：$DSH_HOME/experts；缺省回落 ~/.dsh/experts", () => {
    expect(resolveUserExpertsRoot({ DSH_HOME: "/dsh-home" })).toBe(
      join("/dsh-home", "experts"),
    );
    expect(resolveUserExpertsRoot({}).endsWith(join(".dsh", "experts"))).toBe(true);
  });

  it("resolvePluginExpertsRoot：随包 experts/ 目录真实存在（默认取 scan.ts 自身模块位）", () => {
    const dir = resolvePluginExpertsRoot();
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(join(dir, "code-reviewer.md"))).toBe(true);
  });

  // bug a7bdf03f：打包/无会话环境 process.cwd() 兜底解析到应用安装目录（非项目根）。
  describe("resolveCwdProjectExpertsRoot：cwd 兜底锚合理性（bug a7bdf03f）", () => {
    it("cwd 为应用安装目录形态（无 .git 祖先）→ null（project 层缺席）", async () => {
      const appDir = join(await makeSandbox(), "app-install");
      await mkdir(appDir, { recursive: true });
      expect(resolveCwdProjectExpertsRoot(appDir)).toBeNull();
    });

    it("cwd 为合法项目（.git 根可解析）→ <projectRoot>/.dsh/experts", async () => {
      const l = await makeThreeLayers();
      expect(resolveCwdProjectExpertsRoot(l.cwd)).toBe(l.project);
    });

    it("project root 命中 node_modules 特征（vendor git 仓）→ null", async () => {
      const sandbox = await makeSandbox();
      const vendorRoot = join(sandbox, "node_modules", "pkg");
      await mkdir(join(vendorRoot, ".git"), { recursive: true });
      expect(resolveCwdProjectExpertsRoot(vendorRoot)).toBeNull();
    });
  });
});

describe("三层遮蔽定序（AD3：project > user > plugin）", () => {
  it("同名键高层遮蔽低层，origin 标记胜出层，低层键不再可见", async () => {
    const l = await makeThreeLayers();
    await writeFile(join(l.project, "shared.md"), expertMd("shared", "from-project"));
    await writeFile(join(l.user, "shared.md"), expertMd("shared", "from-user"));
    await writeFile(join(l.plugin, "shared.md"), expertMd("shared", "from-plugin"));
    await writeFile(join(l.plugin, "only-plugin.md"), expertMd("only-plugin", "p"));
    await writeFile(join(l.user, "only-user.md"), expertMd("only-user", "u"));

    const snap = await scanExpertRoots(rootsOf(l));

    expect(snap.experts.get("shared")?.origin).toBe("project");
    expect(snap.experts.get("shared")?.title).toBe("from-project");
    expect(snap.experts.get("only-user")?.origin).toBe("user");
    expect(snap.experts.get("only-plugin")?.origin).toBe("plugin");
    expect(snap.experts.size).toBe(3);
  });

  it("仅 plugin 层在场也能取用（单层扫描）", async () => {
    const l = await makeThreeLayers();
    await writeFile(join(l.plugin, "base.md"), expertMd("base", "p"));
    const snap = await scanExpertRoots([{ origin: "plugin", dir: l.plugin }]);
    expect(snap.experts.get("base")?.origin).toBe("plugin");
  });
});

describe("快照语义（§9：整体换代，无半代索引）", () => {
  it("每次扫描返回完整一代索引：快照对象冻结，含全部三层结果", async () => {
    const l = await makeThreeLayers();
    await writeFile(join(l.plugin, "a.md"), expertMd("a", "1"));
    const gen1 = await scanExpertRoots(rootsOf(l));
    expect(gen1.experts.size).toBe(1);

    await writeFile(join(l.user, "b.md"), expertMd("b", "2"));
    await writeFile(join(l.project, "c.md"), expertMd("c", "3"));
    const gen2 = await scanExpertRoots(rootsOf(l));

    // gen2 完整覆盖三代累计的三个键，无一缺失
    expect([...gen2.experts.keys()].sort()).toEqual(["a", "b", "c"]);
    // 上代快照不受换代影响（取用方持有引用读到的仍是上代完整索引）
    expect(gen1.experts.size).toBe(1);
    // 快照冻结：取用方不可改写索引
    expect(Object.isFrozen(gen2)).toBe(true);
    expect(Object.isFrozen(gen2.experts)).toBe(true);
    expect(() => {
      (gen2.experts as Map<string, unknown>).delete("a");
    }).toThrow();
  });

  it("bug 665186da：layers Map 与 experts 同等冻结强度——set/delete/clear 均无效", async () => {
    const l = await makeThreeLayers();
    await writeFile(join(l.plugin, "a.md"), expertMd("a", "1"));
    await writeFile(join(l.user, "a.md"), expertMd("a", "2"));
    const snap = await scanExpertRoots(rootsOf(l));
    expect(Object.isFrozen(snap.layers)).toBe(true);
    const layers = snap.layers as unknown as Map<string, unknown[]>;
    expect(() => layers.set("x", [])).toThrow();
    expect(() => layers.delete("a")).toThrow();
    expect(() => layers.clear()).toThrow();
    expect([...snap.layers.keys()].sort()).toEqual(["a"]);
  });
});

describe("坏文件隔离（§9 FMEA：单文件跳过，其余不受影响）", () => {
  it("同层一份坏档案被跳过并产出 warning，同层其余档案正常入索引", async () => {
    const l = await makeThreeLayers();
    await writeFile(join(l.user, "good.md"), expertMd("good", "g"));
    await writeFile(join(l.user, "bad.md"), "---\nname: bad\n---\n缺字段");
    const snap = await scanExpertRoots(rootsOf(l));

    expect(snap.experts.has("good")).toBe(true);
    expect(snap.experts.has("bad")).toBe(false);
    expect(snap.warnings.some((w) => w.includes("bad.md"))).toBe(true);
  });

  it("坏文件不影响其他层", async () => {
    const l = await makeThreeLayers();
    await writeFile(join(l.user, "broken.md"), "无 frontmatter 纯文本");
    await writeFile(join(l.plugin, "ok.md"), expertMd("ok", "p"));
    const snap = await scanExpertRoots(rootsOf(l));
    expect(snap.experts.get("ok")?.origin).toBe("plugin");
  });
});

describe("root 不可读降级（§9：warn + 跳过该 root，其余正常）", () => {
  it("root 路径实际是文件 → warn + 跳过，其余层正常", async () => {
    const l = await makeThreeLayers();
    const notADir = join(l.sandbox, "not-a-dir");
    await writeFile(notADir, "x");
    await writeFile(join(l.plugin, "ok.md"), expertMd("ok", "p"));

    const snap = await scanExpertRoots([
      { origin: "project", dir: notADir },
      ...rootsOf(l).slice(1),
    ]);

    expect(snap.experts.get("ok")?.origin).toBe("plugin");
    expect(snap.warnings.some((w) => w.includes(notADir))).toBe(true);
  });

  it("不存在的 root 静默视为空（正常形态，非故障）", async () => {
    const l = await makeThreeLayers();
    await rm(l.project, { recursive: true });
    await writeFile(join(l.plugin, "ok.md"), expertMd("ok", "p"));
    const snap = await scanExpertRoots(rootsOf(l));
    expect(snap.experts.has("ok")).toBe(true);
    expect(snap.warnings).toEqual([]);
  });

  it("updatedAt：来源文件 mtime 的 ISO 串（面板更新时间页脚数据源）", async () => {
    const l = await makeThreeLayers();
    await writeFile(join(l.plugin, "timed.md"), expertMd("timed", "t"));
    const snap = await scanExpertRoots(rootsOf(l));
    const updatedAt = snap.experts.get("timed")?.updatedAt ?? "";
    expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(Date.parse(updatedAt))).toBe(false);
  });
});

describe("layers：同键全层中间态（1.60 用户裁决——展示层聚组数据源）", () => {
  it("同键跨层逐层收集（低→高优先级序 plugin→user→project）；遮蔽语义零改动", async () => {
    const l = await makeThreeLayers();
    await writeFile(join(l.project, "shared.md"), expertMd("shared", "from-project"));
    await writeFile(join(l.user, "shared.md"), expertMd("shared", "from-user"));
    await writeFile(join(l.plugin, "shared.md"), expertMd("shared", "from-plugin"));
    const snap = await scanExpertRoots(rootsOf(l));

    const layers = snap.layers.get("shared")?.map((e) => e.origin) ?? [];
    expect(layers).toEqual(["plugin", "user", "project"]);
    // 生效面仍是 experts 单点：shared 只剩 project 胜出版
    expect(snap.experts.get("shared")?.origin).toBe("project");
  });

  it("单来源键 layers 恰一条；层表冻结（快照语义）", async () => {
    const l = await makeThreeLayers();
    await writeFile(join(l.plugin, "only.md"), expertMd("only", "p"));
    const snap = await scanExpertRoots(rootsOf(l));
    expect(snap.layers.get("only")).toHaveLength(1);
    expect(Object.isFrozen(snap.layers.get("only"))).toBe(true);
    expect(Object.isFrozen(snap)).toBe(true);
  });
});
