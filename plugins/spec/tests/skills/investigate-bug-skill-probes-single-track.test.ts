// investigate-bug SKILL.md 落卷契约测试：落卷落点单轨锚（probes/<bugId>/）——
// 直接读技能文本断言（复刻 grilling-spec-skill-tokens 读法）：锁 probes 单轨落点
// 与 forgeDirs 解析锚 token，锁旧双轨落点（proposals/issues）与「双轨」字样零残留。
// bug-fix-batch-1116 评审：SKILL.md 已改单轨（098f54c7）但两条既有质量门均不读本文件，此处补契约。
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const doc = readFileSync(join(ROOT, "plugins", "spec", "skills", "investigate-bug", "SKILL.md"), "utf8");

describe("investigate-bug SKILL.md 落卷落点契约（probes 单轨）", () => {
  it("落卷锚 = .forge/probes/<bugId>/ 单轨：含 forge_dirs 目录键 project.probes_dir；旧落点 .forge/docs/probes 零残留", () => {
    expect(doc).toContain(".forge/probes/<bugId>/");
    expect(doc).toContain("probes/<bugId>/");
    expect(doc).toContain("project.probes_dir");
    expect(doc).not.toContain("docs/probes");
  });

  it("旧双轨落点 token 零残留：不含 proposals/、issues/<localId>、「双轨」", () => {
    expect(doc).not.toContain("proposals/");
    expect(doc).not.toContain("issues/<localId>");
    expect(doc).not.toContain("双轨");
  });
});
