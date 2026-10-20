# gotcha-dsh-plugin-cli-link-reinstall-reconcile

> 位置：docs/lessons/gotcha-dsh-plugin-cli-link-reinstall-reconcile.md
> 基准：2026-10-20，`@deepseek-ai/dsh` 0.2.0-rc.2 CLI（`dsh plugin --profile web add/remove link:…`），
> composer-input-history-plugin 1.5 真机装卸动线实测（本机 web profile）。

## 1. `DSH_HOME` 在场时 CLI 射到另一棵 profile 树

- 本机 shell `DSH_HOME=D:\software\dsh-forge\data\dsh-home`（dev home）——`dsh plugin --profile web …`
  全部落 **`$DSH_HOME/profiles/web`**，不是 `~/.dsh/profiles/web`。对账核验点必须读对树
  （`<profile>/package.json` 的 dependencies + `dsh.profile.bundles`），否则「装了没装」判断全错。

## 2. 依赖已在 → `add` 变 no-op，bundles 对账被跳过（exit 0 假绿）

- link: 依赖行已写在 profile `package.json` 时（如前次中断的 add 已写入依赖），再次
  `add link:…` = pnpm `Already up to date`（exit 0），**bundles 名单与 patch 层不会补挂**——
  依赖在、`dsh.profile.bundles` 缺行，boot 期该插件整体不进图（无告警，静默缺席）。
- 实测恢复配方：**先 `remove`（带 `--store-dir`）再干净 `add`**——add 期对账只处理「本轮
  变更过的依赖」，故必须让 add 真实产生依赖变更才挂 bundles。
- 判读：add exit 0 ≠ 装载就绪；核验面 = `dsh.profile.bundles` 含本包名 + 依赖行 + junction 在场。

## 3. remove/add 三件套护栏实测补记

- `remove` 不带 `--store-dir` → `ERR_PNPM_UNEXPECTED_STORE`（store 与 profile 树不符）exit 1；
  add/remove 一律显式 `--store-dir C:/Users/panda/AppData/Local/pnpm/store`。
- hoisted junction 残留复现：remove 后 `node_modules/@dsh-forge/input-history` 接合点残留
  （`Test-Path` true）——`cmd /c rmdir` 只删接合点后干净；残留不清不影响功能但污染下次对账。
- 新鲜 add 的完整对账形态（web profile 实测）：依赖行 `link:<abs>` + bundles 追加
  `@dsh-forge/input-history` + junction 在场；包内 `dsh.bundle.patch`（cordis.patch.yml）由
  bundle 层在 boot 组合期加载，profile 根 `cordis.patch.yml` 保持 `[]` 属正常形态。

## 4. boot launch token 单次消费 + 陈服务器 401 假象

- launch token 只在 `GET /?token=` 交换一次；**boot 前必须确认 3080 监听者 = 本轮 boot PID**
  ——否则探针拿新 boot 的 token 打陈服务器（仍 LISTENING 的上一轮 boot），稳定 401
  「authentication required」，与 token 本身有效性无关（本任务 6 轮实测）。
- 配方：`netstat -ano | findstr :3080` 取 PID 与 boot PID 对账后才读 token 起探针；
  陈服务器用 `taskkill /F /PID <pid>` 精确清，勿全杀 node。
- 正确 boot 形态判据：stdout 出现 `dsh web: http://127.0.0.1:3080/?token=…`，stderr 仅
  SQLite ExperimentalWarning，零 `did not activate`。

## 5. 边界（本任务实测，未解）

- 共享 dev home（大量 forge harness 会话/工作区）下，官方 dsh web 的侧栏会话子列表存在
  整体空态形态（工作区行展开零子行；会话文件与 workspace.json 索引均在盘）——成因未定位，
  影响纯浏览器半的 UI 级功能探针（会话开户/翻阅复核）；该 home 的历史会话转录另有
  「历史加载失败（forge/progress 事件对官方 harness 不可读）」与「Unknown agent preset:
  blitz 恢复失败」两类形态。桌面侧 UI 级取证宜用干净 home 或打包版 profile。
