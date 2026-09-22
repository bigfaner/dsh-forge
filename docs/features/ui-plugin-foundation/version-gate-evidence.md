# 版本一致性断言与产物级 vendored 扫描:证据与红灯复现归档(ui-plugin-foundation 任务 4)

> 归档内容:实现载体定夺理由、绿灯证据(真实工作区)、红灯复现(人为错配,全类别)、版本戳机制与 CI 接线说明、上游升级流程。
> 机制本体:`scripts/verify-plugins.mjs`(单一事实源);测试化形态:`tests/verify-plugins.spec.ts`(29 用例)。

## 1. 实现载体定夺(原 tech-design 待决项,quick 模式本任务内裁決)

**裁定:vitest spec + package.json script 双形态,共用同一模块。**

理由:

- **vitest spec 形态 = CI 零额外接线即入质量门**:既有 CI `lint-unit` 腿已运行 `pnpm test`(vitest),新增 `tests/verify-plugins.spec.ts` 自动进入该门;断言失败 = 测试红,无法被绕过。
- **script 形态 = 可独立运行的红灯复现与模板盖戳工具**:`node scripts/verify-plugins.mjs` 支持 `--root`(任意工作区)、`--json`(机读)、`--stamp <pluginDir>`(版本戳),供任务 7 工程模板流出侧盖戳、以及不跑测试套件的场景(如打包前抽查)单独复用。
- **两者不允许各自实现**:比较集、扫描规则、报告结构全部住在 `scripts/verify-plugins.mjs`,spec 只做断言不做判定——否则两条门禁会漂移出第二事实源(违背本提案「唯一事实源」纪律)。
- 纯 CI 步骤形态(无 spec)被否:断言不进 `pnpm test` 意味着本地跑测试看不到版本错配,红灯发现滞后到 CI;纯 hook 形态被否:盖戳(`--stamp`)是维护动作不是校验动作,hook 载体不合适。

## 2. 比对集(显式枚举,禁止为通过断言而放宽)

| 集合 | 成员 | 规则 |
|---|---|---|
| 对齐线 | 所有 `@deepseek-ai/dsh-client-*` 依赖(宿主契约族,任意依赖字段) | 必须 exact 且 ≡ `vendor/upstream.lock.json` 的 `desktopHostVersion`;dist-tag(如 `alpha`)必须先解析为 exact 结果再落盘 |
| 独立版本线 | `@deepseek-ai/cordis`(peer) | 仅要求 exact 锁定;**不**与 `desktopHostVersion` 比对(独立 semver 线,防误报) |
| 集合外 | react / zustand / `@deepseek-ai/dsh-llm` 等其余依赖 | 不参与对齐比对 |

注意:`vendor/upstream.lock.json` 的 desktop-host 闭包**不**枚举完整客户端契约族(如 `@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots` 不在闭包包表内——它们是 Webview 侧运行时由宿主 boot graph 提供的包),因此比对集以「族前缀」为枚举口径(任务 AC 原文口径),不能以 lock 包表成员关系为口径(会误报绿灯依赖)。

## 3. 绿灯证据(2026-09-22,真实工作区)

```
$ node scripts/verify-plugins.mjs
plugin foundation gate (version alignment + vendored scan)
  root: Z:\project\dsh\dsh-forge
  baseline: desktopHostVersion 0.1.6-alpha.2 / cordis 4.0.2 / pinnedSha c36ba648dc106d21fb32562793b3e3b9c8922bc4
  plugins: 2 (@dsh-forge/plugin-hello-world, @dsh-forge/plugin-hello-world-collision)
  scanned: 2 manifests, 17 artifacts, 22 module specifiers
  [PASS] version alignment (explicit set: @deepseek-ai/dsh-client-* exact == desktopHostVersion; @deepseek-ai/cordis exact, independent line)
  [PASS] manifest module sources (no file:/link:/workspace:/path specs into the repo)
  [PASS] artifact module sources (no vendor/ resolutions, no file: into the repo)
  [PASS] plugin build artifacts present
  [PASS] version stamps in sync with vendor/upstream.lock.json
gate PASS: all checks green.
```

要点:两插件全部对齐线依赖 exact `0.1.6-alpha.2` ≡ `desktopHostVersion`;cordis `4.0.2` exact 独立线不误报;产物扫描覆盖 `lib/**/*.js`(含 tsc 类型输出 JS)22 个模块来源,零 vendored 引用;hello-world 版本戳与 lock 同步。

## 4. 红灯复现归档(人为错配,一次性 fixture 工作区,exit=1)

fixture:临时工作区内 3 个插件——plugin-a(版本错配四连)、plugin-b(产物 vendored 引用)、plugin-c(manifest `file:` 依赖 + 过期版本戳 + 未构建)。输出全文:

```
$ node scripts/verify-plugins.mjs --root <tmp-workspace>
plugin foundation gate (version alignment + vendored scan)
  root: <tmp-workspace>
  baseline: desktopHostVersion 0.1.6-alpha.2 / cordis 4.0.2 / pinnedSha c36ba648dc106d21fb32562793b3e3b9c8922bc4
  plugins: 3 (fixture-plugin-a, fixture-plugin-b, fixture-plugin-c)
  scanned: 3 manifests, 2 artifacts, 3 module specifiers
  FAIL version alignment (explicit set: @deepseek-ai/dsh-client-* exact == desktopHostVersion; @deepseek-ai/cordis exact, independent line)
  FAIL manifest module sources (no file:/link:/workspace:/path specs into the repo)
  FAIL artifact module sources (no vendor/ resolutions, no file: into the repo)
  FAIL plugin build artifacts present
  FAIL version stamps in sync with vendor/upstream.lock.json
FAIL: 10 violation(s):
  - [version-alignment] packages/plugins/plugin-a/package.json > peerDependencies["@deepseek-ai/cordis"]: "^4.0.2" — independent version line (not compared with desktopHostVersion) still requires an exact pinned version
  - [version-alignment] packages/plugins/plugin-a/package.json > peerDependencies["@deepseek-ai/dsh-client-store"]: "0.1.5-rc.2" != desktopHostVersion "0.1.6-alpha.2" (vendor/upstream.lock.json) — alignment-line dependencies must equal the vendored host version; bump deps and this assertion in the same diff
  - [version-alignment] packages/plugins/plugin-a/package.json > peerDependencies["@deepseek-ai/dsh-client-ui-chat"]: "^0.1.6-alpha.2" — alignment-line dependency (@deepseek-ai/dsh-client-*) must be an exact pinned version; ranges, dist-tags (resolve `alpha` to its exact result first), workspace:/file: specs are forbidden
  - [version-alignment] packages/plugins/plugin-a/package.json > peerDependencies["@deepseek-ai/dsh-client-ui-slots"]: "alpha" — alignment-line dependency (@deepseek-ai/dsh-client-*) must be an exact pinned version; ranges, dist-tags (resolve `alpha` to its exact result first), workspace:/file: specs are forbidden
  - [version-alignment] packages/plugins/plugin-c/package.json > dependencies["@deepseek-ai/cordis"]: "file:../../vendor/cordis" — independent version line (not compared with desktopHostVersion) still requires an exact pinned version
  - [manifest-sources] packages/plugins/plugin-c/package.json > dependencies["@deepseek-ai/cordis"]: "file:../../vendor/cordis" — file:/path spec resolves into the repo (packages/vendor/cordis) — plugins must stay vendor-free; declare npm registry specs
  - [artifact-sources] packages/plugins/plugin-b/lib/client.js: "../../../../vendor/cordis/lib/index.js" resolves into the vendored tree (vendor/cordis/lib/index.js) — plugin bundles must not reference vendored sources
  - [artifact-sources] packages/plugins/plugin-b/lib/client.js: "file:///Z:/project/dsh/dsh-forge/vendor/some-runtime.js" — file: protocol specifier resolves into the repo (Z:/project/dsh/dsh-forge/vendor/some-runtime.js) — plugin artifacts must not load repo-local files via file:
  - [artifacts-missing] packages/plugins/plugin-c: build artifacts missing (no *.{js,mjs,cjs} under lib/) — the vendored scan cannot verify what was not built; run "pnpm verify:plugins" (builds the plugins, then verifies)
  - [version-stamp] packages/plugins/plugin-c/version-stamp.json: desktopHostVersion "0.1.5-rc.2" != lock "0.1.6-alpha.2" — the stamp is stale; regenerate it in the same diff as the dependency bump
exit=1
```

红灯复现同时以永久回归测试固化(`tests/verify-plugins.spec.ts`:错配 manifest → 断言失败;CLI 子进程 → exit 1)。

**扫描边界(实现口径,防误报)**:产物级红 = ① 相对/绝对路径模块来源解析入 `vendor/` 或 `packages/desktop-host-vendor/` 树;② 说明符自身携带 vendor 路径段(含仓外绝对路径);③ `file:` 协议解析入仓内。bare 说明符(如 `react`、`@deepseek-ai/dsh-client-store`)由宿主 boot graph 运行时解析,不红;仓内非 vendor 相对路径不属于本门红条件(SC1 口径仅限 vendored 树与 `file:` 入仓)。manifest 级红 = `file:`/`link:`/`workspace:`/裸路径依赖说明符解析入仓内(workspace: 按定义即指向工作区,恒红)——这是 SC5「禁 `workspace:^` 照抄」的机器化执行点。

## 5. 版本戳机制(任务 7 模板流出侧,同源盖戳)

- `node scripts/verify-plugins.mjs --stamp packages/plugins/<name>`:从同一 `loadBaseline`(读 `vendor/upstream.lock.json`)派生确定性戳(无时间戳,diff 友好),写入 `<plugin>/version-stamp.json`:`{ source, pinnedSha, desktopHostVersion, cordisVersion }`。
- 戳可选(模板/参照插件持有,普通插件可无);**存在即校验**:任一字段与 lock 不同步 = 红灯——模板流出侧版本同步可见(git diff 可见戳变更)、可断言(门禁强制同步)。
- 参照插件 `packages/plugins/hello-world` 已盖戳(本任务,经 `--stamp` 生成);任务 7 模板脚手架调用同一命令为新插件盖戳。

## 6. 质量门 / CI 接线

- 根 `package.json`:`"verify:plugins": "pnpm build:plugins && node scripts/verify-plugins.mjs"`(先构建保证产物在场,再校验)。
- `.github/workflows/ci.yml` `lint-unit` 腿:`pnpm lint` → **`pnpm verify:plugins`(新增步骤)** → `pnpm test`——置于 vitest 之前,保证门禁 spec(依赖真实产物)可跑。
- 本地裸跑 `pnpm test` 而未构建插件时,门禁 spec 显式红灯(`artifacts missing` + 修复指引),不静默跳过。

## 7. 上游升级流程(断言红灯 = 升级提醒,不静默)

上游 pinned SHA 升级任务(`sync:upstream` + `project:upstream` 后 `desktopHostVersion` 变更)→ 门禁红灯指出版本差 → 同一 diff 内:① 各插件对齐线依赖 bump 至新 exact;② 受影响插件 `--stamp` 重盖;③ 断言与依赖同 diff bump,不存在只改一侧的中间态。
