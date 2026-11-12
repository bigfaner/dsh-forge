// 构建链第一步：全量清 dist（纯生成物目录）——中间产物残留零容忍（plugin-project
// fix-6 判例承袭：离手门审计的是全 dist，任何上游残留都会在 bundle-host 步骤误触发
// client 面违规；全量重出也顺带消灭 tsbuildinfo 陈旧增量语义）。tsc -b 只允许作为
// pnpm build 内部第一步（门禁序固化——质量门在其后重复触发会重排产物，两轮 dist
// 覆写事故判例 bug eed9583b 同族）。Run once per build；run-once, no watch。
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(resolve(pkgDir, "dist"), { recursive: true, force: true });
