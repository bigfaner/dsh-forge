---
created: "2026-09-22"
author: "task 6 (ui-plugin-foundation)"
status: archived-evidence
---

# 壳内双环境装配与打包/闭包验收腿证据归档(任务 6)

> 消费方:任务 6 record、提案 SC1(双环境 + 打包腿)、spike 报告 §4.2 遗留的
> 冷启动实测收口。本文全部结论为 **2026-09-22 本机实测**(live 链路)+ 单测归档;
> 官方 web 侧交互证据为本次复测(任务 3 已归档装配证据,本次补齐点击交互腿)。
> 隐私口径沿用任务 3:证据只采集插件自身标记/文本/报错与会话行点击事实,不归档
> 会话标题与正文;壳内截图只截插件面板元素本身(`artifacts/*.png`)。

## 0. 环境与交付面

| 项 | 值 |
|---|---|
| 分发形态 | **tarball 随包内置 + 壳侧预播种物化**(spike 报告 §4.1 裁定,本任务执行) |
| 载体 | `pnpm pack` 产物 `dsh-forge-plugin-hello-world-0.1.0.tgz`(4738 bytes,sha256 `78b1fa5c…e7e632`),由 `pnpm stage:plugin-tarballs` **按产品配置驱动**staging 进 `apps/desktop/resources/plugin-tarballs/`,electron-builder `extraResources` 滤子 `plugin-tarballs/**` 打进应用资源 |
| 配置 | `apps/desktop/resources/plugin-bundles.json` 提交态 = `[dsh-base, dsh-web-app, @dsh-forge/plugin-hello-world(tarball:…)]` —— 插件身份与工件路径**只**存在于配置 |
| source 词表 | `workspace:<dir>`(dev 内环,junction,任务 2)+ `tarball:<rel .tgz>`(打包态,实体目录解包,本任务);两形态均拒绝绝对路径与 `..` 段 |
| 预播种机制 | 壳启动期对账:manifest 收敛 + tarball 解包为 profile `node_modules/<pkg>` **实体目录**(resolveBundleDir 第二锚接受 junction 或实体目录,spike 事实 9);写一次语义由壳自有 seed 标记(`.dsh-forge-seed.json`,携带工件 sha256)保证——sha 漂移(版本升级)收敛重物化,标记缺席的实体目录视为包管理器所有、永不触碰;上游 `.dsh-module-fallback/` 链接永不触碰 |
| 解包实现 | 壳内零依赖 tar 读取器(`apps/desktop/src/main/host-profile/tarball.ts`;node:tar 在本工具链 Node 24.9 / Electron node 均无此 builtin)——只接受 npm-pack 形态(单一 `package/` 根 + 普通文件/目录),pax/GNU 长名支持,链接/设备项、路径逃逸、坏校验和、截断、容量上限一律显式拒绝,**先全量校验后写盘** |
| 探针 | `live-ui-probe.mjs` 扩展:`--plugin-leg`(boot roster / 面板 DOM 文本 / 面板元素截图 / 点击→store→重渲染)、`--executable`(打包 exe)、`--offline-proxy`(死代理离线模拟);`dsh-web-probe.mjs` 扩展 `--click-panel` |

## 1. AC1:壳内经产品级配置装配(零新硬编码)

**操作**:仅提交配置第三条(tarball source)+ staging 工件;壳代码零身份常量。

**实测(dev 壳,live userData 存量投影 2→3 增腿,2026-09-22 02:41–02:43)**:

1. 存量 `%APPDATA%/Electron/host-profile`(任务 2 收尾的 2-bundle 投影)在本次
   提交态配置下首次启动即对账:manifest `dsh.profile.bundles` 收敛为
   `[dsh-base, dsh-web-app, @dsh-forge/plugin-hello-world]`,并在
   `node_modules/@dsh-forge/plugin-hello-world/` 解包出实体目录
   (`package.json` / `lib/*` / `cordis.patch.yml`)+ seed 标记
   (sha256 = staging 工件 sha,逐字节一致)。
2. boot roster(`__DSH_BOOT__`,59 entries)含 `@dsh-forge/plugin-hello-world`
   —— 产品插件进入宿主推送的注册图。
3. 历史会话轮尾渲染面板(见 §2);0 pageerror / 0 console-error。
4. live-ui-sweep 19/19 GREEN,含「插件树对账:profile manifest ≡ 产品配置」步
   (3-bundle 两侢单一事实源一致)。

**零硬编码证明(双面)**:

- 机器面:新增静态扫描测试 `apps/desktop/tests/shell-plugin-identity.spec.ts`
  ——断言 `apps/desktop/src/**` 全树无 `@dsh-forge/plugin-*` 身份字面量(随单测
  常驻,回归即红灯)。
- 事实面:本次装配的唯一输入 = 配置文件;shell 代码 diff(git)中身份字符串
  零出现;`stage-plugin-tarballs.mjs` 同样按配置推导 staging 集合(构建侧同
  Hard Rule),工件命名与配置声明不符即红灯。

## 2. AC2 + AC3:两侧环境可见渲染与一致性(DOM/截图证据)

同一 hello-world 插件(同一构件字节,sha `78b1fa5c…`),两侧环境 2026-09-22 复测:

| 观察项 | 官方 dsh web(WEB-S0,profile 自装) | dsh-forge 壳(SHELL-S0,产品配置装配) | 一致 |
|---|---|---|---|
| boot graph | 59 entries 含 `@dsh-forge/plugin-hello-world` | 59 entries 含 `@dsh-forge/plugin-hello-world` | ✅ |
| 注入向(基座槽位) | assistant-actions 轮尾渲染面板,marker `hello-world` | 同左 | ✅ |
| 面板文本 | 「你好，世界 — 来自 dsh-forge hello-world 插件的面板 / 打个招呼 / 招呼数：0 / 默认内容：第三方插件可注入此子槽位」 | **逐字符相同** | ✅ |
| 贡献向(自有子槽位) | 默认内容渲染(无第三方注册时的 fallback) | 同左 | ✅ |
| 点击 → store → 重渲染 | 招呼数：0 → **1**(interaction-PASS) | 招呼数：0 → **1**(interaction-PASS) | ✅ |
| 渲染侧错误 | 0 pageerror / 0 console-error | 0 pageerror / 0 console-error | ✅ |
| locale | 中文(用户环境) | 中文(用户环境) | ✅ |

截图归档(壳侧,面板元素本体):`artifacts/SHELL-S0-panel-before-click.png` /
`SHELL-S0-panel-after-click.png`(点击前后,计数 0→1 可见)。官方 web 侧按
任务 3 隐私口径不截图,DOM 文本证据在 `dsh-web-probe --click-panel` 输出。

**结论**:AC2/AC3 PASS —— 消费向(注入基座槽位)与贡献向(自有子槽位默认
内容)在两侧环境均可见渲染,面板渲染、子槽位默认内容、点击→store 更新→刷新
交互行为两侧一致。

## 3. AC4:打包/闭包形态验收腿(spike §4.1 结论执行)

按 spike 分发形态结论执行「tarball 随包内置 + 壳侧预播种物化」并留档:

1. **staging(构建侧)**:`pnpm build:plugins && pnpm stage:plugin-tarballs`
   → `STAGED_TARBALLS {bundle: @dsh-forge/plugin-hello-world, version: 0.1.0,
   bytes: 4738, sha256: 78b1fa5c…}`;staging 集合 = 产品配置 `tarball:` 条目
   派生(非硬编码清单),配置声明文件名与 pnpm pack 产物名不符即红灯。
2. **嵌入(闭包)**:electron-builder `extraResources` 滤子扩展为
   `['plugin-bundles.json', 'plugin-tarballs/**']`;`dist:dir` 产物
   `win-unpacked/resources/` 实测含 `plugin-bundles.json` +
   `plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz`。
3. **闭包自足校验(机器面)**:`scripts/verify-package.mjs` 扩展——除既有
   node 运行时/宿主入口/staging 清单外,新验配置在场 + 配置声明的每个
   `tarball:` 工件在 resources 在场;本打包实测 `selfContained: true,problems: []`
   (installer 117MB,预算内)。
4. **打包态预播种(运行面,live,离线)**:启动打包 exe(`win-unpacked/
   dsh-forge.exe`)挂死代理(见 §4),其 userData 存量投影(2-bundle)对账
   收敛为 3-bundle,并从**应用内嵌资源**解包工件进
   `node_modules/@dsh-forge/plugin-hello-world/`(实体目录 + seed 标记,
   sha256 `78b1fa5c…` 与内嵌工件逐字节一致,seededAt 18:46:32Z 与该次运行
   对应)——零 pnpm、零网络、零构建脚本。

## 4. AC5:与离线自足 NFR 的兼容性结论(显式落档)

**实测:打包态离线运行**。离线模拟 = 启动旗标 `--proxy-server=http://127.0.0.1:9`
(死代理:一切外部 HTTP/WS 代理流量失败;`dsh-app://` 自定义协议不经代理,壳内
装配链路不受影响)。打包 exe 在该环境下完成 §3-4 全部预播种与投影;应用保持
可用面(仅既有已知项报错,见 §5),更新检测按 BIZ-resilience 静默降级、零弹错。

| NFR 项 | 结论 | 依据 |
|---|---|---|
| 离线自足 | **兼容** | 预播种 = 壳内纯文件操作(读资源内 tarball → 解包 → rename → 标记),代码路径无 pnpm/子进程/网络;实测死代理下全链路完成;tarball 载体在应用包内(§3) |
| 进程足迹 = 2 | **不受累** | 物化在壳主进程启动路径内完成,无新增常驻进程;宿主子进程模型未动(M1 SC3 口径) |
| 无监听端口 | **不受累** | 无新增网络面;预播种不涉网络 |
| 零侵入上游 | **不受累** | 壳只写 userData profile 与 host-payload;vendored 树与上游代码零改动 |
| `$DSH_HOME` 多装共存 | **不受累** | 全部物化在 userData 壳自有 profile;官方 web 验证腿用后即还原(profile `web` 回到 `[dsh-base, dsh-web-app]`,物化移除,服务器已停) |
| 冷启动预算(提案 NFR:相对 M1 基线 ≤5% 且 ≤100ms) | **PASS** | 见下 |

**冷启动实测(launch→ui-ready,扩展探针口径,与任务 2 归档同口径)**:

| 状态 | 采样(ms) | 中位 |
|---|---|---|
| M1 基线(任务 2 归档,2-bundle) | 6151 / 4347 / 4314 | 4347 |
| 任务 2 归档 3-bundle(workspace junction 形态) | 4554 / 4579 / 4615 | 4579 |
| **本任务提交态 3-bundle(tarball 预播种)首次启动(含 2→3 对账 + 解包)** | 4342 | — |
| **本任务提交态 3-bundle 稳态(无物化动作,仅对账检查)** | 4548 / 4278 / 4260 | **4278** |

判读(沿用任务 2 的归因纪律):第三 bundle 自身的宿主组合成本(~+230ms,
任务 2 已归档为插件自身成本)不属机器成本;**预播种机制本身的机器增量 = 稳态
对账检查(marker + sha 比对,纯本地 stat/read)**,实测提交态稳态中位 4278ms
相对 M1 基线 4347ms 为 **−69ms**(机器噪声内,≤5% 且 ≤100ms 预算 PASS);同
3-bundle 树下 tarball 实体目录形态(4278)不劣于 junction 形态(4579)。首次
启动的一次性解包成本(4.7KB 工件)未产生可观察的启动离群(4342ms 落在稳态
分布内)。

## 5. 已知局限归属(非本任务回归)

打包 exe 的宿主 boot 仍受 M1 既有遗留项限制:staging 投影**未解引用**的
node_modules 闭包(pnpm 虚拟店/junction 被 staging 拷贝步排除,
`staging-manifest.json` closureNotes 已登记,归属 M1「SC1/SC9 packaging
re-verification」跟进)。本次打包离线运行观察到的唯一报错即该已知项
(`Desktop Host is unavailable` → 壳落入 SC9 崩溃恢复 failed 态 + disc-1
fallback 文档,机制按设计工作);任务 6 的验证面(工件闭包嵌入 + 打包态预
播种)在打包环境全部完成,不依赖该遗留项的解决。dev 壳(真闭包)上 SC7
UI 对等面(sweep 19/19)与 SC9 崩溃恢复单测面(全量 359/359 内)保持绿。

## 6. 复现

```bash
# 单测(含 tar 读取器、预播种语义、配置校验、硬编码静态扫描、staging 计划)
npx vitest run

# 壳内腿(dev,真 userData)
pnpm build:plugins && pnpm stage:plugin-tarballs && pnpm build:desktop
cd apps/desktop
node ../../scripts/acceptance/live-ui-probe.mjs --plugin-leg --label SHELL-S0
node ../../scripts/acceptance/live-ui-sweep.mjs

# 官方 web 腿(交互一致性;结束后 remove 还原 profile)
TGZ=$(pwd)/../../apps/desktop/resources/plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 plugin --profile web add "$TGZ"
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 web --no-open    # 记下 URL+token
node ../../scripts/acceptance/dsh-web-probe.mjs --url "<URL>" --label WEB-S0 --open-session --click-panel
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 plugin --profile web remove @dsh-forge/plugin-hello-world

# 打包腿(闭包 + 离线)
cd ../.. && pnpm assemble:app-resources --check
cd apps/desktop && npx electron-builder --config build/electron-builder.config.mjs --dir
cd ../.. && node scripts/verify-package.mjs
cd apps/desktop && node ../../scripts/acceptance/live-ui-probe.mjs --offline-proxy \
  --executable "$(pwd)/release/win-unpacked/dsh-forge.exe" --label PKG-S0
# 证据:%APPDATA%/@dsh-forge/desktop/host-profile(打包 app userData)= 3-bundle
# manifest + node_modules/@dsh-forge/plugin-hello-world/{…,.dsh-forge-seed.json}
```

**测试归档**:全量 359/359 通过(新增 45:tar 读取器 9 + 预播种语义 11 +
配置校验扩展 2 + 硬编码扫描 1 + staging 计划 3,及既有回归);本次改动模块
行覆盖 host-profile/index.ts 97.4% / tarball.ts 96.6%(仓库全量 87.5% 行);
lint 除既有 `apps/desktop/e2e` 基线外零错。

## 7. 追记(2026-09-22):默认配置不再随包内置 hello-world

产品决定:hello-world 是演示插件,不应成为默认产品装配。上文 3-bundle
提交态与测量数字均为任务 6 当时状态,保留作历史证据。现行状态:

- `plugin-bundles.json` 默认 = 2-bundle 基线(`dsh-base` + `dsh-web-app`,
  无 `source`,走 vendored 闭包两锚解析);`resources/plugin-tarballs/`
  不再默认产出,electron-builder `plugin-tarballs/**` 滤子空匹配。
- 存量 userData profile 由启动期差集调和自动清剪(任务 2 删腿语义,
  config-driven-plugin-lifecycle step-4 实证)。
- 测试侧改按需 `pnpm pack`(与 staging 通道同字节);回归守卫 =
  dual-env step-5 断言默认配置恰好两条基线、零 `@dsh-forge/` 身份。
- 复现第 6 节官方 web 腿的 `TGZ` 来源相应改为自行 `pnpm pack`
  `packages/plugins/hello-world` 的产物。
