# @dsh-forge/forge——forge 组合器 bundle

单件 bundle 组合器：安装 forge 一件，五件插件（project / spec / task-loop / expert-squad / knowledge）经五条裸名插行激活，四件持库插件统一下发共库 config。**纯声明物化器**——零域逻辑、零 db 句柄、不持运行态；卸载 forge 后五件回落各自单装语义，用户数据零丢失。

## 包结构

```text
plugins/forge/
├─ package.json        # @dsh-forge/forge@0.1.0；dsh.bundle.patch 声明 + 五条相对 file: 依赖
├─ cordis.patch.yml    # 插五行 + 集成 config 下发（共库 dbFile）
└─ README.md
```

## 安装（两宿主）

```bash
# dsh-desktop
dsh plugin --profile desktop add <forge 目录>

# npm dsh / 任意 CLI 宿主
dsh plugin --profile forge add <forge 目录>
```

安装即五件依赖闭包（相对 `file:` 依赖）随 forge 进 profile `node_modules`，五条插行随 forge bundle patch 生效。

## 集成 config 下发

- 四件持库插件（project / spec / task-loop / knowledge）统一下发 `dbFile` → `{DSH_HOME}/forge/db/forge/forge.db`（共库，各插件域前缀分表互不越界）；expert-squad 无库，裸行插装。
- `{DSH_HOME}` 占位符由 patch 文件内官方 `!!js` 表达式在 boot 期求值（官方 patch 正门核销：dsh-app-boot `parsePatchList` 的 userPatchesSchema 方言 + Loader 行激活期求值）；`DSH_HOME` 缺席时四件回落各自单装缺省装配（fail-soft）。
- patch config 为**完整对象**：官方 override 语义 = config 整体替换、不与单装缺省深合并。

## 卸载

```bash
dsh plugin --profile desktop remove @dsh-forge/forge
```

插行随 forge bundle 移除，五件不再经 forge 插行装载；存量共库 `forge/forge.db` 只读保留、零丢行；五件可独立单装（各自缺省 db 落点）。

## 开发态说明（workspace 内）

- 五条 `file:../<pkg>` 相对依赖**在发布树 / 安装位生效**；workspace 内开发态经仓库根 `pnpm install` 以本地目录链接形态解析（`plugins/*` 已入 pnpm-workspace），包名可解析性由此兜底。
- 开发期真机验证走目录直装：`dsh plugin --profile web add <repo>/plugins/forge`（隔离回路加 `--from-default-profile web`）；junction 直载形态不作取证依据（AGENTS 1.8）。
- 发布树（五件兄弟目录共置 + 相对 `file:` 重写）由聚合打包脚本（收口批 `scripts/package-release.mjs`）组装。
