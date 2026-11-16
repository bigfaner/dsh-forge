// 离手门测试（plugin-spec 1.2——dist 零 @dsh-forge/* import + exports 闭包完整性）：
// 复用 scripts/self-containment.mjs 的 auditDist 单源（bundle 脚本末尾自跑同一实现）。
// dist 缺席（纯 src 测试树）时 requireDist:false 跳过产物面；build 后恒审计。
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { auditDist } from "../scripts/self-containment.mjs";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("dist self-containment（离手门）", () => {
  it("dist 零 @dsh-forge/* import + 相对引用闭包 + exports 闭包完整性", () => {
    const violations = auditDist(pkgDir, { requireDist: existsSync(resolve(pkgDir, "dist")) });
    expect(violations, `dist 自含审计违规 ${violations.length} 处:\n${violations.join("\n")}`).toEqual([]);
  });
});
