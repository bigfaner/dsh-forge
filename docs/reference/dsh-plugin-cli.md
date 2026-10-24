# dsh plugin 命令参考（插件管理通道）

> 位置：docs/reference/dsh-plugin-cli.md · 基准：2026-10-19，`@deepseek-ai/dsh` 0.2.0-rc.2（源码逐条核销：`dsh/lib/bin.js`、`dsh/lib/plugin-*.js`、`dsh-plugin-manager/lib/types/operations.js`、`dsh-app-boot/lib/index.js`）
> 维护约定：**升级 dsh 版本时复核本文**（命令面、对账语义、豁免落盘均属上游行为）；打包形态背景见 [docs/architecture/packaging-pipeline.md](../architecture/packaging-pipeline.md)，profile 树病理见 [docs/lessons/debug-packaged-profile-tree-boot-chain.md](../lessons/debug-packaged-profile-tree-boot-chain.md)。
> 本文回答三个问题：插件怎么装/卸、两条管理通道各管哪些 profile、护栏在哪儿。

## 0. 一句话心智模型

`dsh plugin` = **pnpm 透传 + 三件套护栏**（预检 → 回滚 → bundles 对账）。它不是裸 pnpm：装什么、卸什么都会被对账进 profile 的 `dsh.profile.bundles` 名单，版本不兼容的包装不进来。管理通道有两条，**各管一段，互不可替代**。

## 1. 两条通道

| 通道 | profile 位置 | 权威 |
|---|---|---|
| CLI：`dsh plugin --profile <name> <pnpm-args...>` | `$DSH_HOME/profiles/<name>`（默认 `~/.dsh`，`DSH_HOME` 可覆盖；本机现有 `web`、`headless`） | 任何人；首次使用按模板自动初始化（模板：acp / web / headless / sdk / sdk-minimal） |
| 应用内插件管理器（设置 → 插件） | 打包版 `{userData}/profile`（部署机 = `<安装目录>\data\profile`） | 仅应用自身（桌面保留 profile，走同一套 `runProfilePnpm` 机器，应用自钉 pnpm） |

- `--profile desktop` 一律拒绝：`profile "desktop" is managed exclusively by the Electron application`。
- **打包版 dsh-forge 的 profile 不在 `$DSH_HOME/profiles/` 下，CLI 射程够不到**（打包版 `DSH_HOME` 另重定向到 `{userData}/dsh-home`）。裁决：**部署机一律走应用内插件管理器；dev 侧 `~/.dsh/profiles/*` 走 CLI**。
- CLI 无全局 `dsh` 时用仓内 shim：`node apps/host/profile.install/node_modules/@deepseek-ai/dsh/lib/bin.js plugin …`。

## 2. 护栏三件套（每条命令的执行语义）

| 阶段 | 行为 |
|---|---|
| 预检（仅 `add` / `install` / `i`） | 先 `pnpm view <spec> name version description dsh --json` 查注册表；版本不兼容 → **分文未装**，exit 1 |
| 执行 | 参数原样转发 pnpm，在 profile 目录内运行；相对 `file:` / `link:` spec 按**调用者 cwd** 锚定绝对路径 |
| 对账（任何动词、exit 0 后） | ① 重验本轮**变更过**的依赖：不兼容 → 快照回滚（恢复 package.json + pnpm-lock.yaml + 修复性重装），exit 1；② 兼容 → reconcile `dsh.profile.bundles`：新依赖声明 `dsh.bundle` 则入列（顺带装载其 patch 层），被移除依赖出列；无 `dsh.bundle` 声明的包警告「仅作普通依赖安装，非 profile 层」 |

**`remove` 同样走对账**——一条命令完成依赖行、锁文件、bundles 名单三处清理。

## 3. 常用动词

```bash
dsh plugin --profile web add @scope/pkg            # 安装（预检 + 对账）
dsh plugin --profile web add link:Z:/path/to/pkg   # 本地 link 安装（相对路径按当前 cwd 锚定）
dsh plugin --profile web remove @scope/pkg         # 卸载（自动 prune bundles 名单）
dsh plugin --profile web why @scope/pkg            # 依赖溯源
dsh plugin --profile web install                   # 按锁文件恢复树
dsh plugin --profile web update @scope/pkg         # 更新
```

## 4. 版本豁免（dsh 自有子命令，不透传 pnpm）

```bash
dsh plugin --profile <name> version-exemptions                     # 查看现行豁免（JSON）
dsh plugin --profile <name> allow-version <pkg@ver> --dsh-version <精确运行时版> --accept-risk
dsh plugin --profile <name> revoke-version <pkg@ver> --dsh-version <精确运行时版>
```

- 落盘 `<profile>/compatibility.json`；豁免只对**精确的 包版本 × DSH 运行时版本**二元组生效。
- `allow-version` 必须 `--accept-risk` 显式认险；`--dsh-version` 必须等于当前运行时版本，错版直接拒绝。
- 装包被版本门拒绝时，CLI 会把对应的 `allow-version` 命令原样打印出来，照抄执行即可。

## 5. 运维与保护面

| 面 | 事实 |
|---|---|
| 并发 | profile `package.json` 文件锁（等待上限 120s）+ 运行记录（pid）互斥——应用内管理器与 CLI 同锁同账本 |
| 日志 | 每次操作落 `<profile>/.plugin-manager/logs/operation-*/pnpm.log`（失败时回显路径） |
| pnpm 来源 | CLI 用 PATH 上的 pnpm；应用内通道用应用自钉 pnpm（部署机实测 CLI 11.7.0 / 应用 11.0.9） |
| pnpm 缺失 | exit 127 + 提示 install pnpm |
| git 托管插件 | prepare 脚本被 pnpm 拦 → 按提示把精确 key 加进 profile 的 `pnpm-workspace.yaml` `allowBuilds` 后重跑 |
| desktop 例外 | 即便走应用内通道：先开一次应用初始化 profile，且**完全退出应用后**才能动 |

## 6. 已知边界（操作后核验点）

- **`link:` 依赖的物理残留**：pnpm hoisted 下 `remove` 可能不剪 `node_modules/<scope>/` 下的 junction（2026-10-19 annotutor 卸载实证）。任何通道卸载后都应核一眼该目录；残留 junction 用 `cmd /c rmdir`（只删接合点，不递归目标）清除。
- 版本门只看**版本兼容面**，不校验客户端产物形状——注册包形状问题（如 ESM 库混入 classic-script 组合批）在 boot 期才暴露，属引擎行为面。
