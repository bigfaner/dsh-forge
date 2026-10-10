# M3.1 D42 会话行 hover 动作组走查记录——官方 fading + iconButton 对照——任务 1.29 · SC-8 终验输入

> **任务**：`dsh-forge-m3.1-ui-alignment/1.29`——[D42 差异行](../proposal.md)（2026-10-10 用户追加裁决：「鼠标悬浮到项目列表的某一个会话时，显示相关的按钮，对齐 dsh」）。
> **消费方**：SC-8 人工终验——实机走查动线见文末「实机走查清单」。
> **证据口径**：本面为产品 DOM 面（hover 交互面）——**实机截图当场产出归档**（e2e harness Electron 实跑捕获，非原型对照图）；双主题 = 官方主题服务同位属性（`body[data-ds-dark-theme]` 单点 toggle，CSS 解析等价面，D33/D39 同口径）；会话夹具 = 零凭据径（sc6-session-links 同径：芯片流开户 + composer 一条消息 = 用户事件落地 → 非 blank 行常显；取证 spec 用后即删）。

## 官方源码核验（0.2.0-rc.2 上游实锚）

- **fading 模式**：`dsh-client-ui-sidebar/lib/client.js` SidebarRoot.module.css `.fading>*{opacity:0;transition:opacity .15s var(--ds-ease-in-out)}`——fading 容器子元素透明占位 + .15s 官方动效令牌过渡，显形由 pointer 状态驱动；
- **iconButton**：同包 `.iconButton{border-radius:var(--dsw-radius-sm);width:28px;height:28px;color:var(--dsw-alias-label-secondary);background:0 0;border:none}` + `:hover{background:var(--dsw-alias-interactive-bg-hover)}`；
- **Rows trailing 对照**：`dsh-client-ui-workspace/lib/client.js` Rows.module.css——sessionRow rowActions = ⋯ 菜单锚（`IconEllipsisOutlineRegular`，session.menu.item 槽）+ `sidebar.workspaces.session.row.action` 扩展槽；`.sessionRow:hover .time{display:none}`（时间让位）；`prefers-reduced-motion` 收敛过渡。

## 修法（对照实现——ForgeWorkspacePanel.tsx SessionRow + sidebar.css D42 块）

- 会话行尾 hover 动作组：fading 等价机制（容器 `opacity:0` 占位——非悬浮行几何零抖动；hover/focus-within 显形 + `opacity .15s var(--ds-ease-in-out)` 官方过渡；`pointer-events:none→auto` 隐形守卫）+ ui-sidebar iconButton 刻度逐值（28 命中区 / radius-sm / label-secondary / 透明底 / hover interactive-bg-hover）；
- **动作集逐位记账**（台账零未记账项）：
  | 位 | 官方 | 产品 | 记账 |
  |---|---|---|---|
  | 行激活 | 行点击/Enter 打开会话 | `onSessionActivate` → 官方 `uiWorkspace.openSession` 单径 | 同缝复用（「打开会话」钮同径——任务「至少打开会话」下限） |
  | ⋯ 菜单锚 | 改名/置顶/归档/删除（session.menu.item 槽） | **缺席**——会话域零 update RPC（`forge:projects/update` 仅项目域 name/archived） | 不虚设（「变更面缺席 = 对应项不出现」P1 口径沿袭） |
  | 扩展槽 | `sidebar.workspaces.session.row.action` | 缺席——产品无扩展动作 | 官方位零产品占用 |
- 时间标签让位（官方对照优先）：官方 `display:none` 同判改透明度承载（占位保留零抖动，非悬浮时间常驻）；
- 行本体 = `div[role=button]`（官方 DisclosureRow 行同型——原生 button 不可嵌套动作钮；Enter/Space 激活 = 官方 toggleFromKeyboard 同语义；动作容器 stopPropagation 防双触发）；
- 既有刻度零回归：h32 / 缩进 8 / 状态点 16 槽 / 相对时间标签 / radius-md 全部原样（D4 记账面）。

## 运行时机械复核（e2e harness 实跑——取证 spec 取证后即删）

```
[d42] light idle   actions=0 time=1 btn=28pxx28px@8px          ← 非悬浮：动作组透明占位、时间常驻
[d42] light hover  actions=1 time=0 btnBg=rgba(0,0,0,0)         ← 悬浮行：动作组显形、时间让位
[d42] light btn-hover bg=rgba(38,49,72,0.06) token=#2631480f    ← 钮 hover 底 = interactive-bg-hover 亮解析值（逐字节相等）
[d42] dark  idle   actions=0 time=1
[d42] dark  hover  actions=1 time=0
[d42] dark  btn-hover bg=rgba(255,255,255,0.08) token=#ffffff14  ← 暗令牌解析值（逐字节相等）
```

- 两主题 hover 显形/时间让位断言均过；动作钮 28×28 @ radius 8px（radius-sm）运行时核对；
- 钮 hover 底与官方主题令牌解析值两主题逐字节相等——官方令牌驱动双主题联动，产品零自持色。

## 双主题截图归档（实机 Electron 捕获——项目块特写 / 侧栏全貌）

| 主题 | 非悬浮（时间常驻·动作组隐形占位） | 悬浮（动作组显形·时间让位） | 动作钮自身 hover（interactive-bg-hover） |
|---|---|---|---|
| 亮 | ![row idle light](shots/d42-row-idle-light.png) | ![row hover light](shots/d42-row-hover-light.png) | ![row btnhover light](shots/d42-row-btnhover-light.png) |
| 暗 | ![row idle dark](shots/d42-row-idle-dark.png) | ![row hover dark](shots/d42-row-hover-dark.png) | ![row btnhover dark](shots/d42-row-btnhover-dark.png) |

侧栏全貌上下文（两主题 · 悬浮态）：![ctx hover light](shots/d42-ctx-hover-light.png) ![ctx hover dark](shots/d42-ctx-hover-dark.png)（另存 idle 全貌 `d42-ctx-idle-{light,dark}.png`）。

**判读**：两主题下悬浮会话行均在行尾显出「打开会话」动作钮（官方 chevron 件 ›，label-secondary 三级色随主题联动），行 hover 底 = interactive-bg-hover 同官方行语言；非悬浮态行面与既有基线零差（动作组透明占位零抖动、时间标签常驻）；悬浮态时间标签让位（官方 `.sessionRow:hover .time` 同判）。亮/暗双主题动作钮均可辨。

## 机械面证据（本任务实跑）

- `just compile` exit=0（tsc -b + copy-assets + vite build）。
- `just fmt` no-op exit=0（仓未配置格式化器）。
- `just lint` 六门 exit=0：oxlint 0 错误、import/selftest/types 全过、**token-lint 0 裸值**（D42 新增 dsw-raw 豁免逐行注记官方原值理由）。
- 定向 vitest：侧栏族 5 文件 + d42 结构 pin 1 文件 = **6 文件 102 用例全绿**（新增 12：组件 markup/源面 pin 7 + CSS 机械 pin 5；TDD 先红后绿——RED 7 失败 → 实现后全绿）。
- 数据面/RPC 零变化（纯 UI 轮）。

## 证据口径与限制（诚实声明）

- **实机截图**：产品 Electron 壳经 e2e harness 实跑当场捕获（临时取证 spec，取证后即删——D33/D39 同口径）；双主题经官方主题服务同位属性切换（`body[data-ds-dark-theme]` DOM 属性面，非设置页点击动线——CSS 解析等价，SC-8 用户动线仍以设置外观亮/暗为准）。
- 截图相位 = RPC 直注项目 → 芯片流 composer 夹具消息（零凭据会话建档）→ 会话行入树 → hover 态捕获；boot 相位竞态（偶发首启落知识面）经「官方新建会话入口拉回会话面」守卫收敛。
- 取证 spec 内含 boot 竞态守卫与零凭据夹具动线，属过程产物不归档入库（本记录已承载复现口径）。

## 实机走查清单（SC-8 用户动线）

1. **切换口径**：官方主题切换（设置外观亮/暗）——每面先亮后暗各过一遍。
2. **hover 显形**：悬浮任一会话行 → 行尾显出「打开会话」动作钮（›），时间标签让位；移出即隐（时间恢复）——对照本记录截图基线。
3. **零抖动**：悬浮/移出往返，行几何（标题/时间槽位）无跳动。
4. **动作有效**：点动作钮 = 打开该会话（主视图切换，与行点击同效；无双重触发）。
5. **键盘可达**：Tab 聚焦动作钮（focus-within 显形）→ Enter 打开；行本体 Enter/Space 亦打开。
6. **回填**：实机观感以「可辨/不可辨」回填本记录即可（截图已归档）。
