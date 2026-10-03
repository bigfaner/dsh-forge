---
name: env-node24-rmsync-cjk-crash
description: Node v24.9.0/Windows fs.rmSync 单文件名含 CJK(3字节UTF-8)原生崩溃——用 unlinkSync；C盘满→TEMP 重定向 Z:
metadata:
  type: feedback
---

规则（本机 Z:\project\dsh\dsh-forge worktree 环境，2026-10-02 实测）：
1. **Node v24.9.0 + Windows：`fs.rmSync(<单文件路径>)` 当文件名含 3 字节 UTF-8 字符（CJK 汉字）时进程原生崩溃**（exit 0xC0000409，无异常抛出）。`unlinkSync` 安全；`rmSync(dir, {recursive:true})` 安全（内部逐文件 unlink）；2 字节字符（如 é）不受影响；与盘符无关（C:/D:/Z: 均 repro）。
   - **静默变体（2026-10-03 实测，T-test-gen-scripts）**：`rmSync(file, {force:true})` 当**父目录名**含 CJK（文件名 ASCII）时不抛异常但**静默不删**（existsSync 仍 true）——知识目录 `.knowledge/前端/build.md` 删除失效导致 e2e 断言假失败；`unlinkSync` 同场景正常。单文件删除一律 unlinkSync 的规则因此覆盖 CJK 父目录场景。
   - **Why:** 测试代码删除含中文名的夹具文件时 vitest worker 整体崩溃，bisect 三轮定位到 libuv rm 路径而非 better-sqlite3/业务代码。
   - **How to apply:** 测试/脚本里单文件删除一律 `unlinkSync`；目录递归删除可继续 `rmSync(recursive)`。见 [[env-vitest-coverage-hidden-files]] 同类「环境坑伪装成测试失败」。
2. **C: 盘 100% 满**（pagefile 无法扩展 → 多 worker fork 偶发 0xC0000409 commit 崩溃 + "No space left on device"）。
   - **How to apply:** 命令前置 `TMP='Z:\project\dsh\tmp-redesign' TEMP=… TMPDIR=…`（node os.tmpdir() 认 TMP/TEMP）+ `VITEST_MAX_WORKERS=4`；不要替用户清理 C: 盘。redesign worktree 无 justfile（旧线产物已移除）：编译门 = `pnpm exec tsc -b`，lint 门 = `pnpm lint`，仓库无 formatter。
   - **TMP 重定向例外（2026-10-02 实证）**：Playwright e2e **不得**带 TMP 重定向跑——`smoke-skeleton.spec` 向导组夹具经 `mkdtempSync(tmpdir())` 落地且测试硬编码走 home → AppData → Local → Temp 面包屑导航（C: 盘路径）；TMP=Z: 时夹具落 Z: 而导航仍走 C: → 目录找不到而失败（伪装成回归）。e2e 全量用默认 TMP 跑（C: 余 1GB 仍够单 worker Electron 套件 ~20s 全绿）；vitest 侧保留重定向 + worker 上限。
3. **vitest 全量跑时 vite 对 `@deepseek-ai/dsh-client-ui-dockkit/lib/index.js.map` 报 ENOENT sourcemap 错误（3.8 起出现，3.gate 复现）**——非致命：vite transform 阶段读不到该 map 文件仅打印 stack，套件照常完成且全绿（866/866）。判读为环境噪音，不要当作测试门失败去修。
