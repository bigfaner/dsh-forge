// spec 目录键登记条目单测（forge-dirs-unification §2.2/§2.5——目录键就近归属使用它的插件）：
// spec.dir / spec.dossier_dir 经注册表解析的绝对路径 pin；卷宗目录与 task-loop 结算回收
// 钩子同形派生逐字相同（bug 14e3a500 先例——specs 替代 proposals）；两键须带 spec 命名空间
// （forge.* 保留名规则不触）；登记序 pin。
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  FORGE_BASE_DIR_ENTRIES,
  dirKeyEntryShapeError,
  forgeDirOfWorkspace,
  resolveForgeDirs,
  type ForgeDirDeclaration,
  type ForgeDirSources,
} from "@dsh-forge/lib-path";
import { SPEC_DIR_ENTRIES, SPEC_DIR_KEYS, SPEC_DIRS_DECLARATION } from "../host/forge-dir-entries.js";

const SOURCES: ForgeDirSources = {
  dshHome: "X:\\dsh-home",
  projectRoot: "Z:\\ws\\main",
  workspaceRoot: "Z:\\ws",
};

const base: ForgeDirDeclaration = { source: "forge.base", entries: FORGE_BASE_DIR_ENTRIES };

describe("spec 目录键条目", () => {
  it("登记序 = spec.dir、spec.dossier_dir；两键形状合格且带 spec 命名空间", () => {
    expect(Object.keys(SPEC_DIR_ENTRIES)).toEqual([...SPEC_DIR_KEYS]);
    for (const key of SPEC_DIR_KEYS) {
      expect(dirKeyEntryShapeError(key, SPEC_DIR_ENTRIES[key])).toBeUndefined();
    }
    expect(SPEC_DIRS_DECLARATION.source).toBe("dirKeys.spec");
  });

  it("带参解析：spec.dir = {ws}/.forge/specs/{slug}；spec.dossier_dir = 其下 issues/{localId}", () => {
    const declared = resolveForgeDirs([base, SPEC_DIRS_DECLARATION], SOURCES, { slug: "demo", localId: "7.2" });
    expect(declared["spec.dir"]).toBe(join("Z:\\ws", ".forge", "specs", "demo"));
    expect(declared["spec.dossier_dir"]).toBe(join("Z:\\ws", ".forge", "specs", "demo", "issues", "7.2"));
  });

  it("spec.dossier_dir 与 task-loop 结算回收钩子落点逐字相同", () => {
    const declared = resolveForgeDirs([base, SPEC_DIRS_DECLARATION], SOURCES, { slug: "demo", localId: "fix-1" });
    const hookDir = join(forgeDirOfWorkspace(SOURCES.workspaceRoot), "specs", "demo", "issues", "fix-1");
    expect(declared["spec.dossier_dir"]).toBe(hookDir);
  });

  it("无参形态（forge_dirs）：两带参键参数缺席即跳过", () => {
    const declared = resolveForgeDirs([base, SPEC_DIRS_DECLARATION], SOURCES);
    expect(Object.keys(declared)).toEqual(["forge.home"]);
  });
});
