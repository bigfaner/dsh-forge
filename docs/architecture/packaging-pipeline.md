# dsh-forge 打包流程（安装包管线全景）

> 位置：docs/architecture/packaging-pipeline.md · 基准：2026-10（产品插件配置化 + staging 闭包自动推导收口后 HEAD）
> 维护约定：**改打包管线 / 产品插件启停机制 / staging 结构时同步本文档**；约定级 Requirement 见 [docs/conventions/packaging.md](../conventions/packaging.md)，历史病理见 [docs/lessons/debug-installer-staging-closure-drift.md](../lessons/debug-installer-staging-closure-drift.md)。
> 本文回答三个问题：安装包里装了什么、怎么装进去的、装完之后怎么跑起来。

## 0. 一句话心智模型

dsh-forge 有**双形态**：dev 形态直链 workspace 构建产物（`apps/host/profile.dev/`，开发全量可用）；packaged 形态把「workspace 构建产物 + 官方栈安装树 + 自动推导的产品插件集合」物化成一个**自足运行时容器**（`release/staging/runtime/`），经 electron-builder 以 extraResources 嵌入 NSIS 安装包。宿主本体只是一个 deps-free 装载器（`release/app/main.js`），真实 main 在运行时容器里。首启时 host 把 profile 模板落地用户数据目录，此后每次启动加载。

## 1. 命令链

```
pnpm dist:win
 ├─ pnpm build        tsc -b 全拓扑 + copy-preset-assets（预设底稿进 dist）+ apps/web vite 壳
 ├─ pnpm dist:stage   node scripts/assemble-installer-resources.mjs   ← 物化 release/staging
 └─ node scripts/dist-win.mjs                                          ← electron-builder NSIS

pnpm dist:check       assemble --check（staging 自校验；带位置参数 = 安装后 resources 同口径校验）
```

## 2. staging 工件结构（assemble-installer-resources.mjs 物化）

```
release/staging/
  runtime/                      自足运行时容器
    package.json                合成 anchor 清单（profile.install deps ∪ @dsh-forge/* 真实版本）
                                ——打包形态 installAnchor（resolveHostPaths 指向 {resources}/runtime）
    node_modules/               完整 hoisted 真实文件树（源 = apps/host/profile.install，
                                autoInstallPeers:true 补 peer 闭包）+ @dsh-forge/* 产品插件真实拷贝
    host-dist/                  apps/host/dist 拷贝——boot child 真实文件入口
  web-dist/                     apps/web/dist（壳静态资产）
  icon.png                      窗口图标（fix-45——BrowserWindow 打包形态解析位）
  staging-manifest.json         物化清单（节数据 + 关键文件自证 + sqlite prebuild 证据）
release/app/                    electron-builder 应用目录（asar:false）
  main.js                       装载器（apps/host/installer/app-loader.mjs）
  package.json                  deps-free 清单
```

物化前置 fail-loud（缺席即停 + 补救命令提示）：workspace 全部 dist 产物、profile.install 安装树（含 better-sqlite3 prebuilds）、build/icon.png、contracts dist（配置装载源）。

## 3. 产品插件启停：意图开关 + 自动推导

单一配置源 = `packages/contracts/src/product-plugins.ts`（`PRODUCT_PLUGINS`——**只承载意图，不列举闭包成员**）：

| 字段 | 语义 | 消费面 |
|---|---|---|
| `userLayerRow` | 打包 profile 模板用户层 insert 行（全局装载） | `apps/host/src/profile/template.ts`（cordis.patch.yml 首启落地） |
| `staged`（可选覆写） | `false` = kill-switch（被引用也不随包）；`true` = 强制发货；缺席 = 自动推导 | assemble 物化清单 |

staging 集合**自动推导**（`stagedProductPackages()`）：

```
staging = BFS闭包( userLayerRow 插件
                 ∪ 预设底稿携带插件（扫 presets/*.patch.yml 的 name:'@dsh-forge/…' 行）
                 ∪ staged:true 覆写 ) 的 @dsh-forge/* 运行时依赖
        − staged:false kill-switch
```

- **新增产品包零配置**：被行/预设/依赖引用即自动随包；contracts/path-key 类闭包成员自动入场（e791a46「忘列 path-key」病理结构性消除）。
- 带技能面的插件在 `STAGING_EXTRAS` 补 skills 物化与关键文件口径（plugin-forge / plugin-forge-spec）。
- 现值裁决：`knowledge` = `{ userLayerRow: false, staged: false }`——知识库功能不完整，打包形态暂不开放（dev 形态 profile.dev 仍含，开发时全量可用）。
- 不受配置约束的两面：boot overlay 的插件行 config 注入按 profile 树**运行期探测**（[apps/host/src/boot/overlay.ts](../../apps/host/src/boot/overlay.ts) knowledgeRow 门——配置翻转后双形态自动自洽）；dev 形态手维文件不受限。

守护测试：`tests/structure/installer-pipeline.test.ts`（推导集合 pin + 闭包自洽——kill-switch 误伤即红）、`apps/host/src/profile/materialize.test.ts`（模板行 ↔ 配置同步 pin）。

## 4. 运行期链（安装后首启 → 窗口）

```
安装包 exe
 └─ release/app/main.js（装载器）→ 进程内拉起 runtime/host-dist/main.js（真实 main）
     ├─ resolveHostPaths：packaged 形态 installAnchor = {resources}/runtime/package.json
     │  （dsh-app-boot resolution BFS 以它为根遍历出全量 entries）
     ├─ ensureProfileMaterialized：首启把 profile 模板四件落地 {app-data}/dsh-forge/profile/
     │  （幂等不重写；插件行成员 = PRODUCT_PLUGINS userLayerRow 门派生）
     └─ bootDshHost：spawn boot child（ELECTRON_RUN_AS_NODE=1）
         ├─ loadBootChain（boot 链与插件树同拷贝解析——fix-20）
         ├─ loadProfileDirectory → boot overlay 每启重写（core 行 dbFile/tasksHome/settingsFile、
         │  knowledge 行 bindingsFile（条件注行）、预设三底稿物化绝对路径、welcome ack 预确认）
         └─ runProfile → ready{url, injections, 服务在场位} → BrowserWindow 载入壳 dist
```

## 5. 关键实测约束与历史坑（速查）

| 约束/坑 | 处置 |
|---|---|
| Electron 须精确 44.0.0（node-addon-require-builtin 指纹门仅接受 43/44/45.0.0-alpha.6） | electron-builder.config.mjs pin |
| `ELECTRON_RUN_AS_NODE` 子进程无法读 asar；ESM 解析沿目录上溯 | `asar:false` + 真实 main 居 runtime/host-dist（与 node_modules 同容器相邻） |
| electron-builder 拷贝会剔除拷贝源根级 node_modules | 运行时容器 node_modules 嵌一层（`runtime/node_modules/`） |
| published `@deepseek-ai/dsh` 依赖闭包不足（peer 包须安装侧供应） | profile.install 安装树 `autoInstallPeers:true`（S1 实测 31 项精确 pin） |
| Windows 删 staging 树偶发 ENOTEMPTY（Defender/索引器延迟释放） | rmSync 统一带 `maxRetries:10, retryDelay:100` |
| staging 硬编码清单漏闭包成员 → 打包形态 ESM 解析断链、forge:* 通道全灭 | 已根治：staging 集合改依赖闭包自动推导（本文 §3） |
| 官方 `!!js` 表达式在打包形态不可解析（无 installAnchor BFS 上下文） | 预设底稿物化：占位符→绝对路径、平台门行→具体布尔，零表达式残留 |

## 6. 验证面（打包质量门）

| 层 | 手段 |
|---|---|
| 结构/推导 | `tests/structure/installer-pipeline.test.ts`（配置派生、闭包自洽、electron-builder 配置形状）+ `materialize.test.ts`（模板/幂等/ dev 同步） |
| staging 自证 | `pnpm dist:check`（关键文件口径 = 推导派生；`staging-manifest.json` 随包分发可复验） |
| 安装后实机 | `node scripts/assemble-installer-resources.mjs --check <resources-dir>`（4.3 冒烟对安装后 resources 同口径） |
| 端到端 | `e2e/specs/p1mvp/installer-smoke.spec.ts`（NSIS 装后 exe 直启：boot manifest、首启落地、三区工作台、零页面错误） |
