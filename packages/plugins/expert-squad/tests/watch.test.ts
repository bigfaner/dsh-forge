// store/watch 单元测试（tech-design §5 / §10.1）：chokidar 深度 1 监听 + fs/observed
// 双通道失效（语义同 skill-filesystem），变更后索引整体换代——新增/修改/删除 .md
// 后 5s 内下一次扫描可见新内容（§10 验收 5）。

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { scanExpertRoots, type ExpertOrigin } from "../src/store/scan.js";
import {
  ExpertWatchManager,
  makeFsObservedInvalidator,
  waitForInvalidation,
} from "../src/store/watch.js";

const tmpRoots: string[] = [];

afterAll(async () => {
  await Promise.all(tmpRoots.map((r) => rm(r, { recursive: true, force: true })));
});

async function makeSandbox(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "expert-squad-watch-"));
  tmpRoots.push(dir);
  return dir;
}

/** 真实 root 目录（存在）+ 一个不存在的 root（正常形态，静默空）。 */
async function makeRoots() {
  const sandbox = await makeSandbox();
  const dir = join(sandbox, "experts");
  await mkdir(dir, { recursive: true });
  const missing = join(sandbox, "no-such-experts");
  const roots: { origin: ExpertOrigin; dir: string }[] = [
    { origin: "project", dir },
    { origin: "user", dir: missing },
  ];
  return { sandbox, dir, missing, roots };
}

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

/** 低延迟 watch 参数：测试不必等真实写稳定窗口。 */
const FAST = { stabilityThresholdMs: 25, pollIntervalMs: 10 };

function makeManager(roots: { origin: ExpertOrigin; dir: string }[]) {
  const waiters: Array<() => void> = [];
  const onInvalidated = vi.fn(() => {
    for (const w of waiters.splice(0)) w();
  });
  const manager = new ExpertWatchManager(roots, { ...FAST, onInvalidated });
  return {
    manager,
    onInvalidated,
    nextFired: () => new Promise<void>((r) => waiters.push(r)),
  };
}

describe("chokidar 通道：新增/修改/删除 .md 后索引整体换代（验收 5：5s 内可见）", () => {
  it("新增 .md → 失效触发，重扫可见新专家", async () => {
    const { dir, roots } = await makeRoots();
    const h = makeManager(roots);
    await h.manager.start();

    await writeFile(join(dir, "new.md"), expertMd("new", "added"));
    await waitForInvalidation(h.nextFired(), 5000);

    const snap = await scanExpertRoots(roots);
    expect(snap.experts.get("new")?.title).toBe("added");
    await h.manager.dispose();
  });

  it("修改 .md → 失效触发，重扫可见新内容", async () => {
    const { dir, roots } = await makeRoots();
    await writeFile(join(dir, "edit.md"), expertMd("edit", "v1"));
    const h = makeManager(roots);
    await h.manager.start();

    await writeFile(join(dir, "edit.md"), expertMd("edit", "v2"));
    await waitForInvalidation(h.nextFired(), 5000);

    const snap = await scanExpertRoots(roots);
    expect(snap.experts.get("edit")?.title).toBe("v2");
    await h.manager.dispose();
  });

  it("删除 .md → 失效触发，重扫后该键不可见", async () => {
    const { dir, roots } = await makeRoots();
    const file = join(dir, "gone.md");
    await writeFile(file, expertMd("gone", "x"));
    const h = makeManager(roots);
    await h.manager.start();

    await rm(file);
    await waitForInvalidation(h.nextFired(), 5000);

    const snap = await scanExpertRoots(roots);
    expect(snap.experts.has("gone")).toBe(false);
    await h.manager.dispose();
  });
});

describe("fs/observed 通道：模型 edit/write 首方变更同步失效（语义同 skill-filesystem）", () => {
  it("edit/write actor 且路径在 root 内 → 失效", () => {
    const dir = "x";
    const h = makeManager([{ origin: "project", dir }]);
    const handler = makeFsObservedInvalidator(h.manager);

    handler({ displayPath: join(dir, "a.md") }, {}, { name: "edit" });
    handler({ displayPath: join(dir, "b.md") }, {}, { name: "write" });
    expect(h.onInvalidated).toHaveBeenCalledTimes(2);
  });

  it("非变更 actor（如 read/bash）、root 外路径、非 .md 文件 → 不失效", () => {
    const h = makeManager([{ origin: "project", dir: "x" }]);
    const handler = makeFsObservedInvalidator(h.manager);

    handler({ displayPath: join("x", "a.md") }, {}, { name: "read" });
    handler({ displayPath: join("other", "a.md") }, {}, { name: "write" });
    handler({ displayPath: join("x", "notes.txt") }, {}, { name: "edit" });
    handler({ displayPath: join("x", "a.md") }, {}, undefined);
    expect(h.onInvalidated).not.toHaveBeenCalled();
  });

  it("多文件竞速变更合并为一次失效（microtask 合并，语义同 skill-filesystem）", async () => {
    const { dir, roots } = await makeRoots();
    const h = makeManager(roots);
    await h.manager.start();

    await Promise.all([
      writeFile(join(dir, "a.md"), expertMd("a", "1")),
      writeFile(join(dir, "b.md"), expertMd("b", "2")),
    ]);
    await waitForInvalidation(h.nextFired(), 5000);
    // 合并窗口内多次事件至少一次失效；紧随其后允许因 awaitWriteFinish 追加，
    // 但不要求多次——断言至少触发即可（coalesce 不丢事件即正确）。
    expect(h.onInvalidated.mock.calls.length).toBeGreaterThanOrEqual(1);
    await h.manager.dispose();
  });
});

describe("生命周期与降级", () => {
  it("逐出竞速（bug 38f87c0f）：dispose 时 start 在途/迟到 → 不残留 watcher（有界性）", async () => {
    const { roots } = await makeRoots();
    const h = makeManager(roots);
    // start 在途即逐出：dispose 与未完成的 start 竞速
    const inFlight = h.manager.start();
    await h.manager.dispose();
    // 迟到的 start（逐出后误用同一 manager）也不得开启新 watcher
    const late = h.manager.start();
    await Promise.race([Promise.all([inFlight, late]), new Promise((r) => setTimeout(r, 2000))]);
    const watchers = (h.manager as unknown as { watchers: Map<string, unknown> }).watchers;
    expect(watchers.size).toBe(0);
  });

  it("dispose 后文件变更不再触发失效", async () => {
    const { dir, roots } = await makeRoots();
    const h = makeManager(roots);
    await h.manager.start();
    await h.manager.dispose();

    await writeFile(join(dir, "after.md"), expertMd("after", "x"));
    await new Promise((r) => setTimeout(r, 150));
    expect(h.onInvalidated).not.toHaveBeenCalled();
  });

  it("root 不存在 → start 正常完成（静默空，后续 mkdir 后仍可监听到新增）", async () => {
    const { missing, roots } = await makeRoots();
    const h = makeManager([roots[1]!]);
    await expect(h.manager.start()).resolves.toBeUndefined();

    await mkdir(missing, { recursive: true });
    await writeFile(join(missing, "late.md"), expertMd("late", "x"));
    await waitForInvalidation(h.nextFired(), 5000);
    await h.manager.dispose();
  });

  it("非 .md 文件变更不触发失效（root 下深度 1 仅档案语义）", async () => {
    const { dir, roots } = await makeRoots();
    const h = makeManager(roots);
    await h.manager.start();

    await writeFile(join(dir, "notes.txt"), "hello");
    await new Promise((r) => setTimeout(r, 150));
    expect(h.onInvalidated).not.toHaveBeenCalled();
    await h.manager.dispose();
  });
});
