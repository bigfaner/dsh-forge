# Spike 3 Findings: 会话聚焦通道与 locale 读取侦察

> 任务:1.3 · 日期:2026-09-20 · 对应 tech-design Interface 5(session-focus)与 Interface 7(i18n)
> 纪律:上游本地源码 `Z:\project\github\deepseek-harness`(pinned `c36ba648`)为唯一权威;以下每条结论均附源码引用(符号 / 文件)。

## 1. 通道侦察:三候选逐一核查

聚焦的目标行为 = 上游 client UI 的「切换当前会话」,实现于 sessions 服务:

- `SessionRuntime.open(id: SessionId): void`(`packages/client/runtime/lib/types/client/sessions/service.d.ts:211`)——"Staging IS the open signal — the window opens ⟺ the session is on stage"(同文件 :358)。
- 当前选中会话的持久化:**renderer 侧 localStorage**,键 `dsh.sessions.current`(`packages/client/runtime/lib/types/client/sessions/service.js:136`:`createSnapshotStore({}, { persist: { name: 'dsh.sessions.current' } })`),由 `attachPersistence` 落盘(`packages/client/store/src/index.ts:145-162`,纯 `localStorage.getItem/setItem`,无 `storage` 事件监听)。

### 候选 A:URL hash —— 否决

- client 入口(`apps/web/src/main.ts`、`packages/client/web/src/boot.ts`)与 UI 层(`packages/client/ui-layout/` 等)grep `location.` / `hashchange` / `pushState` / HashRouter:**零命中**。
- 上游 SPA 无 URL 路由;会话选择状态完全活在 cordis context + localStorage,URL 不承载任何会话状态。改 URL hash 不会触发任何上游行为。

### 候选 B:postMessage —— 否决

- 全 client 树(`packages/client/**/src`、`apps/web/src`)grep `addEventListener('message'` / `postMessage`:**零命中**(仅测试 fixture 有 window.open)。
- 上游不存在任何 window message 通道;宿主注入行(`IndexInjection`,见下)也没有注册过 message 监听。无接收方 = 通道不存在。

### 候选 C:deep-link —— 否决

- 上游 desktop 主进程(`apps/desktop/lib/main.js`,源码投影产物)grep `setAsDefaultProtocolClient` / `open-url`:**零命中**;唯一协议处理是 `protocol.handle(SCHEME, ...)`(`dsh-app://` 资源/转发,不解析会话语义)。
- 二实例路径只有 `application.on("second-instance", focusOwner)`(main.js:8275)——仅聚焦窗口,不携带 payload。
- 上游无自定义协议注册、无 deep-link 会话寻径。

**结论:三候选全部否决(上游 `c36ba648` 无任何可复用的外部会话聚焦入口)。`focusSession()` 无法在不修改上游 GUI 的前提下(TECH-ui-reuse-001)对运行中的 SPA 发起聚焦。**

### 1.1 注入点侦察(carrier 先例核实)

任务提到的 `DESKTOP_TRANSPORT_SCRIPT` 字面符号在上游 `c36ba648` 已不存在;现存等价先例链为:

1. 宿主子进程在 ready 消息中回传注入表:`process.send?.({ type: 'ready', url, injections: ctx.webServer.collectIndexInjections() })`(`apps/desktop-host/src/index.ts:74`);
2. Electron 主进程保存并通过 boot IPC 回传:`injections = ready.injections` → `ipcMain.handle(DESKTOP_IPC.boot, ...)` 返回 `{ injections, streamBaseUrl }`(`apps/desktop/lib/main.js:10125-10126、10273`);
3. renderer 入口消费:`apps/web/src/main.ts:23-33` —— 设置 `__DSH_TRANSPORT__` 后 `applyIndexInjections(injections, ...)` 逐行执行,再 resolve `__DSH_BOOT_READY__`;
4. Electron 侧还有一条更底层的字符串注入先例:`serveWebDocument` 对 index.html 做 `replace("<head>", "<head><script>...__DSH_BOOT_READY__...</script>")`(`apps/desktop/lib/main.js:8583`)。
5. 注入行类型系统:`IndexInjection`('global' | 'script' | 'script-src' | 'style' | 'html')与 `renderIndexInjections`(`packages/host/webserver/src/injections.ts:15-96`)。

结论:**壳拥有 `dsh-app://` 协议处理器(等价拥有第 4 条先例的注入位),可在 index.html 中于 client bundle 之前追加 `<script>`;这是 M1 UF3/UF4 覆盖层既定的同一管道。**

### 1.2 通道可行变体:boot 期 localStorage 注入(附 PoC,判定为 M2 增强、M1 不采用)

虽无运行期通道,但存在一个零侵入的 boot 期变体:利用 1.1 的注入位,在 client bundle 构造 sessions store **之前**写入持久化选中键,SPA 启动时经既有恢复路径自动聚焦:

- 恢复语义已由上游保证:"startup restore (persisted selection validated against the live list)"(`packages/client/runtime/lib/types/client/sessions/service.js:151-156`);"a selection survives transient list states (reconnect re-pull) and resurfaces when its session returns"(`.../sessions/service.d.ts:171-175`)。
- 写入格式:`JSON.stringify(sessionId)`(`packages/client/store/src/index.ts:154`,整值 JSON 持久化)。

PoC 片段(壳主进程在 `dsh-app://app/index.html` 响应中、于一切 bundle `<script>` 之前注入;仅通知点击且需聚焦时置入一次性标记):

```js
// dsh-forge shell: focus-poke injection(boot 期一次性)
// 前置:window.__DSH_FORGE_FOCUS__ 由壳以 IndexInjection 风格的
// '<script>globalThis.__DSH_FORGE_FOCUS__ = <json></script>' 行写入 head 首位
;(function () {
  var sid = globalThis.__DSH_FORGE_FOCUS__
  if (typeof sid !== 'string' || sid === '') return
  try { localStorage.setItem('dsh.sessions.current', JSON.stringify(sid)) } catch (_) {}
})()
```

**限制(为何 M1 不采用)**:
1. 仅 boot 期有效 —— `attachPersistence` 无 `storage` 事件监听(`packages/client/store/src/index.ts:145-162`),运行中窗口写入 localStorage 不触发切换;要生效必须 `loadURL` 重载 SPA(丢失在途 UI 状态,代价 > 收益);
2. `dsh.sessions.current` 是上游内部持久化键(非契约面),上游升级可能改名 —— 需运行期 feature-detect + fallback 兜底,维护成本高于 M1 收益;
3. 与 SC5 驻留/通知召回主场景(窗口常驻运行)错位。

## 2. fallback 判定(固化)

**M1 固化 fallback:focusSession 不可用。** 通知点击行为 = 前置主窗口(`BrowserWindow.focus` + 还原)+ toast「请手动切换到会话 X」(i18n key `toast.manualSwitch`),`focusSession()` 恒返回 `false`(tech-design Interface 5 原文)。boot 期 localStorage 注入记为 M2 候选增强(需上游键名稳定性观察期),非 M1 范围。

## 3. locale 读取方式:二选一结论

**选定 ①:直接读 `$DSH_HOME/settings.yaml`(只读文件读取),不走宿主事件流快照。**

依据:
- 上游 client 的语言偏好是 Host 用户设置文档的一个命名空间:`LOCALE_SETTINGS_NAMESPACE = 'locale'`、`LOCALE_PREFERENCE_FIELD = 'preference'`、合法内置值 `LOCALE_IDS = ['zh', 'en']`(`packages/client/locale/src/locale-settings.ts:5-20`);写路径 `LocaleRuntime.setLocale → host.set('preference', id)`(`packages/client/locale/src/client/index.ts:236-242`),经 `SettingsScopeController`(`persistence: 'host'`)走 `remote.settings` RPC(`packages/client/ui-settings/src/client/settings-scope.ts:63-69`)。
- 该 Host 设置文档由文件承载:`<harness home>/settings.yaml`(`packages/settings/settings-file/src/index.ts:23、52-57`,"Settings document path; defaults to `settings.yaml` under the harness home")。
- 否决 ②(宿主事件流快照):locale 偏好不经 session 事件流广播(变化只走 settings mirror 的 RPC 订阅,`settings-scope.ts` 的 `mirror.subscribe`);壳若走此路需自建一条 settings.describe RPC 通道,超出 Interface 1 的事件面。直接读文件与 tech-design「只读、init 期一次」的约束完全匹配。

**读取规则(固化 Interface 7 init 实现)**:启动时读 `$DSH_HOME/settings.yaml` 的 `locale.preference`;值为 `zh`/`en`(BCP 47 校验 `LOCALE_ID_PATTERN`)则采用,`zh-CN` 等按 primary subtag 归一为 `zh`(上游 `detectBrowserLocale` 同款归一,`packages/client/locale/src/client/index.ts:515-528`);文件缺失 / 键缺失 / 解析失败 → 缺省 `'zh'`(上游语义为「缺省委托浏览器检测」,壳无浏览器面,按 tech-design 定 `'zh'`)。仅 init 读取,不监听变更(用户在设置面改语言后,壳层文案下次启动跟随)。

## 4. 对 tech-design 的落点

- Interface 5:spike 结论 = 三候选否决,fallback 生效(与 tech-design 原文一致,无需修订);Open Questions 的 Spike 3 条目可勾选。
- Interface 7:init 读取方式固化为「直接读 `$DSH_HOME/settings.yaml` `locale.preference`」(与原文「$DSH_HOME settings 键,只读」一致,补充了精确键路径与缺省规则)。
