# S1 spike：薄宿主 runProfile 直跑可行性裁决（任务 1.1）

> 裁决日期：2026-10-02｜上游：`@deepseek-ai/*` `0.2.0-rc.2`（npm 实装）｜Electron `44.0.0` 精确 pin｜Windows 11 x64 实测。
> Hard Rule：本目录为 spike 草稿，**不得**演化为 1.4 正式宿主——结论回填后按 `apps/host` 子模块落点（profile/boot/ipc/window）重写装配。

## 裁决：直跑可行（feasible）——不触发 vendor fallback

85 行 Electron main（`main.mjs`，双形态单文件）以 dsh 公开 npm 栈直跑官方 web profile 成功开出窗口。
**且超出预期：boot 可直接跑在 Electron main 进程内**（上游官方 Desktop 用子进程形态，本 spike 两种形态均实测通过）。

| 运行 | 形态 | profile | 结果 | 证据 |
|---|---|---|---|---|
| run1 | direct-in-main | 纯官方组合（`userLayer:false`） | ✅ 窗口开出，12 injections，exit 0 | `run1-official.log` |
| run2 | direct-in-main | 自定义用户层（官方行 + 预留行） | ✅ `userPatches=2` 接受，窗口开出，exit 0 | `run2-custom.log` |
| run3 | child（`ELECTRON_RUN_AS_NODE=1 --expose-internals`，官方 Desktop 形态） | 自定义用户层 | ✅ `{url, injections}` IPC 回传，窗口开出，exit 0 | `run3-child.log` |

复现：`pnpm install`（spike 根与 `profile/` 各一次；electron 二进制 `node node_modules/electron/install.js`，需 `ELECTRON_MIRROR`）→ `S1_AUTO_EXIT=1 ./node_modules/.bin/electron main.mjs`。交互观察去掉 `S1_AUTO_EXIT`。环境开关：`S1_MODE=auto|direct|child`、`S1_USER_LAYER=off`。

## G1 pin 回填（契约面清单第 8 项）

### 两个 API 的实测签名（0.2.0-rc.2，源码 `packages/boot/app-boot/src/profile.ts:655` / `apps/cli/src/profile-boot.ts:244` 核实 + 实跑）

```ts
// @deepseek-ai/dsh-app-boot
loadProfileDirectory(binName: string, dir: string, installAnchor: string,
  options?: { userLayer?: boolean }): Profile
// Profile = { name, dir, layers: {packageName, packageDir, patchPaths, patches}[],
//             patchPath, patches, skippedBundles }；userLayer:false 跳过读 cordis.patch.yml
reportSkippedBundles(binName, profile): void        // 打印 skipped 摘要
loadLayeredEnv(binName): LaunchEnvironmentSnapshot  // .env 分层快照

// @deepseek-ai/dsh/profile-boot（即 CLI 包 @deepseek-ai/dsh 的子路径出口）
runProfile(options: RunProfileOptions): Promise<{ ctx: Context; shutdown: ProcessShutdown }>
// RunProfileOptions = { environment, profile: string（仅诊断标签）,
//   resolvedProfile?: { profile: Profile; installAnchor: string },  // 供给即绕过 CLI profile 目录解析
//   fromDefaultProfile?, patchFiles: readonly string[], args: readonly string[],
//   packageManager? }
// 就绪后取 URL 与 boot manifest：
//   ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`)
//   ctx.webServer.collectIndexInjections()   // → {url, injections}（G1 第 1 项缝）
```

### profile 目录形状（S1 pin）

```
<profileDir>/
  package.json        # { name, private, dependencies: {bundle 包: 精确版本},
                      #   dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } } }
  cordis.patch.yml    # 用户层（YAML 顶层数组；空/纯注释会 fail boot，须写 []）；
                      #   按 row id 整体替换 config（非深合并，保留字段须重述）；insert 行可带 disabled: true
  pnpm-workspace.yaml # packages:[-.] / nodeLinker: hoisted / autoInstallPeers: false（上游 PROFILE_PNPM_WORKSPACE 同款）
  node_modules/       # pnpm 安装的 bundle 及其依赖树
  cordis.yml          # 【每次启动由 runProfile 重写】空根 include（`[]`）——Loader 需要真实根锚定 baseUrl
```

### 首启落地行为（产品宿主 1.4 需要物化的全部内容）

- host 首启需落地：profile 模板三件（package.json + cordis.patch.yml + pnpm-workspace.yaml）+ `node_modules`（pnpm 安装或随应用资源分发）+ **运行时包集合**（见下）。
- 每次启动 `runProfile` 重写 `profile/cordis.yml`（幂等，空数组）；`$DSH_HOME`（默认 `~/.dsh`）被触碰（`.credentials.yaml` 等）——**产品须重定向 `DSH_HOME` 到应用数据目录**实现隔离（本 spike 已实证 `DSH_HOME` 环境变量生效）。
- bundle 解析失败不阻断：进 `skippedBundles` 继续；用户层 YAML 非法则 fail startup。

## 实测约束（1.4/1.5 实现注记直接输入）

1. **Electron 版本指纹门（最硬约束）**：`node-addon-require-builtin`（runtime resolution 依赖）维护 Electron 指纹允许清单，实测 **仅接受 `43.0.0` / `44.0.0` / `45.0.0-alpha.6`**；`44.5.1` 直接拒绝（`Unsupported/no-context`），且 `ELECTRON_RUN_AS_NODE=1` 子进程形态同样被拒（指纹按进程 V8 判定，与形态无关）。上游 lockfile 锁 `electron@44.0.0` 精确版。**→ tech-design Dependencies 的「electron 44」细化为精确 `44.0.0`；升级 Electron = 等上游扩展指纹清单。**
2. **运行时包集合要自查补全**：published `@deepseek-ai/dsh` 的依赖闭包**不足**——web profile 组合的插件包以 peerDependencies 声明 dsh-* 能力包（`dsh-sandbox`、`dsh-output-retention` 等 19 个，见 spike `package.json`），须由**安装侧**（installAnchor 树）供应（runtime resolution 只做映射不凭空供包）。上游 Desktop 以私有 `@deepseek-ai/dsh-desktop-host`（**未发布 npm**）闭包解决。产品宿主必须维护自己的运行时包清单（= 官方组合 peer 闭包 ∪ 产品插件）。**这是 1.4 profile/ 子模块的核心职责之一。**
3. **Electron ESM main 顶层 await 死锁坑**：`await app.whenReady()` 写在模块顶层 = 死锁（Electron 等 ESM 入口求值完成才发 `ready`）。boot 逻辑必须放进 `void (async () => {})()` 内。已写入 `main.mjs` 注释。
4. **直跑形态裁决**：direct-in-main 实测通过且更简（无需 IPC 编排）；child 形态（官方 Desktop 同款）作为已验证的备选——若未来直跑形态破坏（如 addon 在 main 进程语义收紧），**无需 vendor**，退 child 形态即可。
5. Windows 工程细节：pnpm 11 `allowBuilds` 需显式批准 5 个原生包（`node-pty`/`koffi` 等均有 prebuild，免 MSVC 编译）；electron 二进制下载需 `ELECTRON_MIRROR`。

## fallback（vendor desktop-host）触发条件——均未触发

- 上游停止发布 `@deepseek-ai/dsh`/`dsh-app-boot` 公开 npm 包，或锁步发布断裂；
- runtime resolution 的 Electron 指纹清单与可用 Electron 版本同时失去交集（direct 与 child 形态均不可用）；
- `loadProfileDirectory`/`runProfile` 出口从公开包移除（如收进私有 desktop-host）。

任一触发 → 按总纲 fallback vendor `apps/desktop-host`，并同步修订 1.4 Reference Files 与实现注记。

## 结论处置

- G1 契约面清单第 8 项已回填（见 `docs/features/dsh-forge-p1-mvp/design/tech-design.md` Appendix）。
- 1.4 装配输入：直跑可行 → 按 `apps/host` 子模块（profile/boot/ipc/window）正式装配；`profile/` 子模块职责含运行时包集合补全与首启落地；`boot/` 消费 `{url, injections}`。
- 本 spike 的 `main.mjs` 为裁决证据，**不作为** 1.4 代码基础（Hard Rule）。
