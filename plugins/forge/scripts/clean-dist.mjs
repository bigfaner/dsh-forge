// 构建链第一步：全量清 dist（纯生成物目录）——中间产物残留零容忍（离手门
// 审计的是全 dist，任何上游残留都会在 bundle-host 步骤误触发 client 面违规；全量
// 重出也顺带消灭 tsbuildinfo 陈旧增量语义）。Run once per build；run-once, no watch。
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(resolve(pkgDir, "dist"), { recursive: true, force: true });
