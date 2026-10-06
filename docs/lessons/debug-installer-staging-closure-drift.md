# debug- 打包形态注册恒报「No handler registered」（staging 闭包漂移）

- Tags: dependencies, local-dev-deployment, testing
- Date: 2026-10-06
- Source: fix-bug 会话（commit e791a46）

## Problem

安装版（NSIS）应用注册项目恒失败：「注册失败（未预期错误）……Error invoking remote method 'forge:projects/register': Error: No handler registered for 'forge:projects/register'」。dev 形态与全部 e2e 单测同时全绿，问题只在打包形态复现；主进程控制台仅一条 warn（`forgeProjects 服务缺席——forge:projects/* 通道未注册`），无任何加载错误直达用户面。

## Root Cause

缺陷与症状隔着五层装配链，且每层都有降噪设计：

1. fix-30 起 `@dsh-forge/core` / `@dsh-forge/knowledge` 运行时依赖 `@dsh-forge/path-key`；
2. `scripts/assemble-installer-resources.mjs` 的 `PRODUCT_PACKAGES` 是**硬编码清单**（`['contracts','core','knowledge']`），未随依赖图同步——staging 的 `runtime/node_modules/@dsh-forge/` 缺 path-key；
3. boot child（ELECTRON_RUN_AS_NODE）import core 插件时 ESM 解析 `'@dsh-forge/path-key'` 落空（打包树是 hoisted 平铺，没有 dev 形态 pnpm 的包级 node_modules 兜底）→ 插件装载失败；
4. main 侧 fail-soft：服务缺席只记 warn 不注册 forge:* 通道（壳面不受损的设计初衷）；
5. renderer invoke 未注册通道 → Electron 通用错误「No handler registered」→ UI 兜底文案「未预期错误」。

dev 形态不炸的原因：pnpm workspace 把 workspace 依赖链接进 `packages/core/node_modules`，插件解析不经过 staging 清单。

## Solution

- `PRODUCT_PACKAGES` 补 `'path-key'`（物化目录 + 合成 anchor 清单随之携带）；
- `REQUIRED_KEY_FILES` 增 path-key `package.json`/`dist/index.js` 两件——`--check` 安装后冒烟口径同步覆盖（对旧安装实测正确报缺，证明检测面闭合）；
- `assertPreconditions` 增 `packages/path-key/dist/index.js` 前置（构建缺产物即早停）；
- 守护测试：`tests/structure/installer-pipeline.test.ts` staging 闭包段——已 staging 产品包的 `@dsh-forge/*` 运行时依赖必须在 staging 口径内（TDD RED→GREEN 实证缺口）。

## Reusable Pattern

- **安装版 Electron 当探针**：`ELECTRON_RUN_AS_NODE=1 <安装目录>/dsh-forge.exe --input-type=module -e "await import('file:///<resources>/runtime/node_modules/@dsh-forge/core/dist/index.js')"` ——一条命令把五层 boot 链压缩成单点 import 判定，修复前 `Cannot find package '@dsh-forge/path-key'`、修复后 `inject = workspaceRegistry,workspaceController`，证据直接来自用户实机同款运行时。
- **症状在 IPC 面、根因在装配面的先验**：「No handler registered」= 主进程没注册通道；本项目通道注册被 `host.services.* !== undefined` 门控 → 服务缺席 → 插件没装载 → 先查 staging/依赖闭包，再查 handler 代码本身。
- **硬编码清单必须配闭包守护**：清单与依赖图是两个演进速度的源，凡「清单枚举 + 图演化」结构（staging 产品包、runtime-packages、allowlist）都应有「枚举集 ⊇ 图投影」的结构测试，否则漂移只是时间问题。

## Related Files

- scripts/assemble-installer-resources.mjs（PRODUCT_PACKAGES / REQUIRED_KEY_FILES / assertPreconditions）
- tests/structure/installer-pipeline.test.ts（staging 闭包守护）
- apps/host/src/main.ts（服务缺席 fail-soft 门控——症状显形位）
- packages/core/package.json / packages/knowledge/package.json（path-key 运行时依赖声明）
