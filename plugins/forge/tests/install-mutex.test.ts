// forge apply 安装互斥守卫单测（INV-3——bug ef3e92ea，forge-aggregate-bundle 1.32）：
// forge 侧双向守卫（solo 成员在场 → loud-fail 拒载）+ 组合标记 provide（成员侧守卫
// 现查消费点）+ patch comboMark 行形态 pin + 五件成员守卫字面量跨包对账。
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { apply } from "../host/index.js";
import { FORGE_COMBO_SERVICE_KEY, PRESENCE_SERVICE_KEYS } from "../host/assembly.js";

const FORGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKTREE_ROOT = resolve(FORGE_ROOT, "..", "..");
const FIVE = ["project", "spec", "task-loop", "expert-squad", "knowledge"] as const;

/** fake ctx（diag emit 捕获 + provide spy + reflect 可编程现查） */
function makeCtx(opts: { memberPresent?: boolean } = {}) {
  const diag: Array<{ event: string; level?: string }> = [];
  const provide = vi.fn();
  const ctx = {
    reflect: {
      get: (name: string) => {
        if (name === FORGE_COMBO_SERVICE_KEY) return undefined;
        return opts.memberPresent && Object.values(PRESENCE_SERVICE_KEYS).includes(name as never)
          ? { present: true }
          : undefined;
      },
    },
    provide,
    emit: (event: string, payload: { event?: string; level?: string }) => {
      diag.push({ event: payload.event ?? event, level: payload.level });
      return payload;
    },
  };
  return { ctx, diag, provide };
}

describe("forge apply 安装互斥守卫（INV-3）", () => {
  it("组合标记服务键 pin（成员侧守卫现查单源——跨包零 import，字面量对账见下）", () => {
    expect(FORGE_COMBO_SERVICE_KEY).toBe("forgeCombo");
  });

  it("五件全缺席（bundle 正常形态）→ 放行：provide 组合标记 + forge-bundle-apply info 留痕", () => {
    const { ctx, diag, provide } = makeCtx();
    expect(() => apply(ctx)).not.toThrow();
    expect(provide).toHaveBeenCalledWith(FORGE_COMBO_SERVICE_KEY, expect.objectContaining({ channel: "forge-bundle" }));
    expect(diag.some((d) => d.event === "forge-bundle-apply" && d.level === "info")).toBe(true);
  });

  it("solo 成员在场（越装场景）→ throw loud-fail + forge-bundle-conflict error 留痕 + 零 provide", () => {
    const { ctx, diag, provide } = makeCtx({ memberPresent: true });
    expect(() => apply(ctx)).toThrow(/INV-3.*安装互斥/s);
    expect(diag.some((d) => d.event === "forge-bundle-conflict" && d.level === "error")).toBe(true);
    expect(provide).not.toHaveBeenCalled();
  });

  it("patch 五件插行各携 comboMark: true（组合装载判据单源——成员行缺此键 = solo 越装行）", () => {
    const yaml = readFileSync(join(FORGE_ROOT, "cordis.patch.yml"), "utf8").replace(/\r\n/g, "\n");
    for (const member of FIVE) {
      const block = yaml.match(new RegExp(`^ {4}- id: ${member}$[\\s\\S]*?(?=^ {4}- id: )`, "m"))?.[0] ?? "";
      expect(block, `插行 ${member} 携 comboMark: true`).toContain("comboMark: true");
    }
  });

  it("五件成员守卫字面量跨包对账（no-cross-plugin-imports 红线下的单源 pin——漂移即红）", () => {
    for (const member of FIVE) {
      const src = readFileSync(join(WORKTREE_ROOT, "plugins", member, "host", "install-mutex.ts"), "utf8");
      expect(src, `${member} 守卫键字面量与 forge 同值`).toContain(`FORGE_COMBO_SERVICE_KEY = "${FORGE_COMBO_SERVICE_KEY}"`);
    }
  });
});
