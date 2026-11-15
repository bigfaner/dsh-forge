// task-loop 六组件迁批机检双锚（ui-slots.md §四 风险 2/3 对策 + 摘除面完成态判据）：
//   ① 壳 apps/web/src/client-plugin/plugin.ts 零 task-loop 六键注册残留（注释行剥离后
//      逐字面量清单断言；FORGE_HEALTH_SLOT_KEYS 看门清单同批摘除断言）；
//   ② task-loop dist/client 产物零 dshForge 引用（产物在场时跑；构建不在场时跳过并注明
//      ——bundle 由 plugins/task-loop scripts/bundle-client.mjs 生成，最终门主会话统一收口）。
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const PLUGIN_SRC = join(ROOT, "apps/web/src/client-plugin/plugin.ts");

/** task-loop 六键字面量清单（ui-slots.md §四 风险 2——机检清单单源） */
const TASK_LOOP_KEYS = ["dispatchTask", "forge-event-group", "dswf-overview", "forge-dispatch-events"] as const;

/** 注释行剥离（行首斜杠注释与块注释——注册残留判读只看代码行） */
function codeLinesOf(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

describe("机检 ①：壳 plugin.ts 零 task-loop 六键注册残留（1.13 摘除面完成态）", () => {
  const src = readFileSync(PLUGIN_SRC, "utf8");
  const code = codeLinesOf(src);

  it.each(TASK_LOOP_KEYS)("代码行零字面量残留：%s", (key) => {
    expect(code, `壳 plugin.ts 代码行含 task-loop 键「${key}」残留`).not.toContain(key);
  });

  it("'dswf-doc' 仅存 shell.overlay openDocResource 运行期消费常量（DOC_TAB_KIND/DOC_ADDRESS_PREFIX 两声明——零注册行）", () => {
    const occurrences = code.split("dswf-doc").length - 1;
    expect(occurrences, "壳 plugin.ts 'dswf-doc' 出现次数漂移（应恰为两常量声明）").toBe(2);
    expect(code).toMatch(/export const DOC_TAB_KIND = 'dswf-doc'/);
    expect(code).toMatch(/export const DOC_ADDRESS_PREFIX = 'dsh-resource:\/\/dswf-doc\/'/);
  });

  it("FORGE_HEALTH_SLOT_KEYS 看门清单零 task-loop 键（W4 计数洞位不含迁出键）", () => {
    const block = src.match(/export const FORGE_HEALTH_SLOT_KEYS = \[[\s\S]*?\] as const/)?.[0] ?? "";
    expect(block, "FORGE_HEALTH_SLOT_KEYS 声明未命中（对账面改名未同步机检）").not.toBe("");
    for (const key of TASK_LOOP_KEYS) {
      expect(block, `看门清单含迁出键「${key}」`).not.toContain(key);
    }
  });

  it("已退役常量零声明（OVERVIEW_TAB_KIND / TOOL_CALL_TOOLVIEW_SLOT / DISPATCH_TASK_TOOL_KEY）", () => {
    for (const name of ["OVERVIEW_TAB_KIND", "TOOL_CALL_TOOLVIEW_SLOT", "DISPATCH_TASK_TOOL_KEY"]) {
      expect(code, `壳 plugin.ts 含已退役常量「${name}」声明`).not.toMatch(new RegExp(`export const ${name}\\b`));
    }
  });
});

describe("机检 ②：task-loop dist/client 产物零 dshForge 引用（self-containment——产物缺席跳过）", () => {
  it("dist/client 产物在场时零 dshForge 字面量；缺席 = 跳过并注明（构建不在场）", () => {
    const distClient = join(ROOT, "plugins/task-loop/dist/client.js");
    if (!existsSync(distClient)) {
      console.info("[ui-machine-checks] task-loop dist/client.js 不在场（构建未落位）——机检 ② 跳过");
      return;
    }
    const bundle = readFileSync(distClient, "utf8");
    expect(bundle, "task-loop client 产物含 dshForge 引用（单装断链风险——ui-slots §四 风险 3）").not.toMatch(/dshForge/);
  });

  it("client 产物源（ui/ 全树）零 dshForge 引用（源级前置锚——产物缺席时仍承门）", () => {
    const files = [
      "plugins/task-loop/ui/index.ts",
      "plugins/task-loop/ui/conversation-views-face.ts",
      "plugins/task-loop/ui/dock-tabs-face.tsx",
      "plugins/task-loop/ui/dispatch-events-face.tsx",
      "plugins/task-loop/ui/tasks-rpc.ts",
      "plugins/task-loop/ui/tasks-hub.ts",
      "plugins/task-loop/ui/dispatch-events-panel/DispatchEventsPanel.tsx",
    ];
    for (const rel of files) {
      const p = join(ROOT, rel);
      if (!existsSync(p)) continue;
      const src = codeLinesOf(readFileSync(p, "utf8"));
      expect(src, `${rel} 含 dshForge 引用`).not.toMatch(/dshForge/);
    }
  });
});
