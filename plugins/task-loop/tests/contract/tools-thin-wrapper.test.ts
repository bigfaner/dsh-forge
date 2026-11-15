// tool = 薄封装机检（plugin-task-loop 1.11）：host/tools/ 全目录扫描——工具文件只做
// agent 面入参解析 + 域动词委派 + render，禁止直触 db / SQL / 域逻辑内联。
// 判据（文本级机检，与 project 同型结构 pin 先例）：
//   ① 零 better-sqlite3 import（连接只属 db/connection.ts + domain 动词层）；
//   ② 零 SQL 语句字面量（SELECT/INSERT/UPDATE/DELETE + task_ 表前缀组合）；
//   ③ 每个 create*Tool 工具文件都 import 自 ../domain/（委派面在位）。
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TOOLS_DIR = fileURLToPath(new URL("../../host/tools", import.meta.url));

const toolFiles = readdirSync(TOOLS_DIR).filter((f) => f.endsWith(".ts") && f !== "faces.ts" && f !== "args.ts");

describe("tool = 薄封装机检（host/tools/）", () => {
  it("工具目录非空（迁移面在位）", () => {
    expect(toolFiles.length).toBeGreaterThan(0);
  });

  for (const file of toolFiles) {
    describe(file, () => {
      const raw = readFileSync(`${TOOLS_DIR}/${file}`, "utf8");
      /** 去注释后文本（注释里的纪律说明不参与机检匹配）。 */
      const src = raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");

      it("零 better-sqlite3 直触", () => {
        expect(src).not.toContain("better-sqlite3");
      });

      it("零 SQL 语句字面量（域 SQL 单点在 domain/db 层）", () => {
        expect(src).not.toMatch(/(SELECT|INSERT\s+INTO|UPDATE\s+task_|DELETE\s+FROM)\s/i);
      });

      it("委派面在位（import 自 ../domain/ 域动词或 ../loop/ 循环 seam——循环壳同构薄封装）", () => {
        expect(src).toMatch(/from "\.\.\/(domain|loop)\//);
      });
    });
  }
});
