// 构建链第一步：全量清 dist（纯生成物目录）——中间产物残留零容忍（bug eed9583b 家族：
// 离手门审计的是全 dist，任何上游残留都会在后续步骤误判/漏审；全量重出也顺带消灭
// tsbuildinfo 陈旧增量语义）。Run once per build；run-once, no watch。
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(resolve(pkgDir, "dist"), { recursive: true, force: true });
