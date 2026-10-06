// e2e 锚常量面（fix-37 ②）——data-* 散字面量（55+ 处 ×12 文件）单源化：
// 官方锚（dsh-client-ui 上游 DOM 契约）与产品锚（apps/web data-dswf-* 台账）分区，
// 下次锚迁移改一处。值拼装厂（workbenchOfView 等）承载带值锚；CSS 类名锚
// （.dswf-kn-card/.dswf-fb-item/.dswf-heat-badge 等组件内样式钩）不在 data-* 台账内，
// 留守字面量。选择器值与既有 specs 逐字等价（机械替换，零语义变化）。

// ─── 官方锚（上游 dsh-client-ui DOM 契约——升级窗口时对照面） ───

/** 官方会话转录滚动面（含流式正文） */
export const CONVERSATION_CONTENT = '[data-conversation-content]'
/** 官方会话滚动容器（ConversationContent scrollBody——fix-38 书海背景 CSS 锚宿主） */
export const CONVERSATION_SCROLL = '[data-conversation-scroll]'
/** 官方 composer 座（滚动容器内 sticky 座——fix-38 覆层 z 序对照面） */
export const COMPOSER_SEAT = '[data-composer-seat]'
/** 官方会话页签行（ConversationSessionHeader——会话作用域，blank 会话不渲染） */
export const TABS_ROW = '[data-conversation-tabs]'
/** 官方会话页签项（role=tab——对话/轨迹/知识召回三签 roster） */
export const TAB_ITEM = '[data-conversation-tabs] [role="tab"]'
/** 官方 composer 输入面（contenteditable） */
export const COMPOSER_INPUT = '[data-composer-input]'
/** 官方会话面板槽（main.conversation——fix-25 官方基座） */
export const MAIN_CONVERSATION = '[data-slot="main.conversation"]'
/** 官方会话头部链渲染点 */
export const CONVERSATION_HEADER = '[data-slot="conversation.header"]'
/** 官方轨迹视图滚动面（ui-trajectory——fix-29 直用） */
export const TRAJECTORY_SCROLL = '[data-trajectory-scroll]'
/** 官方轨迹表行（data-kind = system|user|context|compacted|message|tool|subtool） */
export const trajectoryRow = (kind: string): string =>
  `[data-trajectory-scroll] tr[data-kind="${kind}"]`
/** 官方右栏 frame 收起标记（收起/休眠在场、展开退场——fix-23） */
export const RIGHTBAR_COLLAPSED = '[data-rightbar-collapsed]'
/** 官方右栏列 */
export const RIGHTBAR_COL = '[data-rightbar-col]'
/** 官方右栏展开钮（corner ExpandButton——动作 = sidebarRight.toggleExpanded） */
export const SIDEBAR_RIGHT_EXPAND = '[data-sidebar-right-expand]'
/** 官方右栏 dockkit 页签条页签 */
export const DOCKKIT_STRIP_TAB = '[data-rightbar-col] [data-dockkit-strip] [role="tab"]'
/** 官方右栏 dockkit surface（横条形 dropZones 形态断言锚） */
export const DOCKKIT_SURFACE = '[data-rightbar-col] [data-dockkit-surface]'
/** 官方右栏 dockkit 内容挂载面 */
export const DOCKKIT_CONTENT = '[data-rightbar-col] [data-dockkit-content]'
/** 官方 strip chrome 收展钮 */
export const COLLAPSE_RIGHTBAR_BUTTON = '[data-rightbar-col] button[aria-label="收起右侧边栏"]'
/** 官方折叠控件（dsh-client-ui-sidebar toggle.collapse 词条——两态 aria） */
export const SIDEBAR_COLLAPSE_BUTTON =
  'button[aria-label="收起侧边栏"], button[title="收起侧边栏"]'
/** 官方折叠控件展开态（rail 期） */
export const SIDEBAR_EXPAND_BUTTON =
  'button[aria-label="打开侧边栏"], button[title="打开侧边栏"]'
/** 官方导航壳（#root nav——折叠/导航/快捷键白拿面） */
export const NAV_SHELL = '#root nav[aria-label]'
/** 知识库入口（官方 panellist 行 aria——fix-25 产品 nav 行迁官方 PanelRow） */
export const KNOWLEDGE_ENTRY = 'button[aria-label="知识库"]'

// ─── 产品锚（apps/web data-dswf-* 台账） ───

/** 工作台根锚（相位/视图值随行） */
export const WORKBENCH = '[data-dswf-workbench]'
/** 工作台 + 视图值（session|knowledge） */
export const workbenchOfView = (view: string): string =>
  `[data-dswf-workbench][data-dswf-view="${view}"]`
/** 工作台相位值读取厂（getAttribute 断言面用 toHaveAttribute('data-dswf-phase', …)） */
export const WORKBENCH_PHASE_ATTR = 'data-dswf-phase'
/** 产品工作区面板（值 = wide|rail） */
export const sidebarOf = (mode: string): string => `[data-dswf-sidebar="${mode}"]`
/** 产品工作区面板（任意态） */
export const SIDEBAR_ANY = '[data-dswf-sidebar]'
/** 侧栏骨架 */
export const SIDEBAR_SKELETON = '[data-dswf-sidebar-skeleton]'
/** 项目树行（值 = projectId） */
export const projectRowOf = (projectId: string): string => `[data-dswf-project="${projectId}"]`
/** 项目树行（任意） */
export const PROJECT_ROW_ANY = '[data-dswf-project]'
/** rail 态项目图标钮（值 = projectId——fix-42 图标列） */
export const railProjectOf = (projectId: string): string => `[data-dswf-rail-project="${projectId}"]`
/** rail 态项目图标钮（任意） */
export const RAIL_PROJECT_ANY = '[data-dswf-rail-project]'
/** 平铺视图列表容器（fix-42 groupBy=flat） */
export const SIDEBAR_FLATLIST = '[data-dswf-flatlist]'
/** 项目行尾动作钮（值 = new-session|menu——fix-42 行语言） */
export const projectActionOf = (action: string): string => `[data-dswf-project-action="${action}"]`
/** 项目改名模态输入（fix-42） */
export const RENAME_INPUT = '[data-dswf-rename-input]'
/** 会话行（值 = 账本 sessionId） */
export const sessionRowOf = (sessionId: string): string => `[data-dswf-session="${sessionId}"]`
/** 会话行（任意） */
export const SESSION_ROW_ANY = '[data-dswf-session]'
/** hero「＋添加项目」CTA */
export const CTA_ADD_PROJECT = '[data-dswf-cta="add-project"]'
/** 侧栏「＋」添加入口（项目态走查入口） */
export const NAV_ADD_PROJECT = '[data-dswf-nav="add-project"]'
/** hero 相位面板 */
export const HERO = '[data-dswf-hero]'
/** 知识浏览视图壳（含锚属性 data-dswf-kn-anchor 值断言） */
export const KNOWLEDGE_VIEW = '[data-dswf-knowledge-view]'

// ── 知识浏览（UF-6） ──
export const KN_TOOLBAR = '[data-dswf-kn-toolbar]'
export const KN_CARDS = '[data-dswf-kn-cards]'
export const KN_SKELETON = '[data-dswf-kn-skeleton]'
export const KN_DRAWER = '[data-dswf-kn-drawer]'
export const KN_SUMMARY = '[data-dswf-kn-summary]'
export const KN_META_ROW = '[data-dswf-kn-meta-row]'
export const KN_BODY = '[data-dswf-kn-body]'
export const KN_TREE = '[data-dswf-kn-tree]'
export const KN_BROWSE = '[data-dswf-kn-browse]'
/** 域树节点（值 = 域路径） */
export const domainNodeOf = (domain: string): string => `[data-dswf-domain="${domain}"]`
/** 知识卡片（值锚 data-dswf-entry；卡片本体类 .dswf-kn-card） */
export const ENTRY_CARD = '[data-dswf-entry]'
/** 无结果面清除过滤入口 */
export const CLEAR_FILTERS = '[data-dswf-clear-filters]'

// ── 会话召回（UF-4） ──
/** 召回面板壳（conversation.view 'dswf-recall' 占用者） */
export const RECALL_PANE = '[data-dswf-pane="recall"]'
/** 召回 tab 统计面（data-calls/data-covered 值锚随行） */
export const RECALL_STATS = '[data-dswf-recall-stats]'
/** 召回分组行 */
export const RECALL_ROW = '[data-dswf-recall-row]'
/** 召回 tab 本体（统计 + 分组行容器） */
export const RECALL_TAB = '[data-dswf-recall-tab]'
/** 召回空态面（idle/零事件——「本会话暂无召回」） */
export const RECALL_FACE_EMPTY = '[data-dswf-recall-face="empty"]'
/** 召回行动词明细（值 = verb 投影） */
export const RECALL_VERB = '[data-dswf-recall-verb]'
/** 侧栏空态 */
export const EMPTY_STATE = '[data-dswf-empty]'

// ── 添加项目两段模态（UF-1） ──
/** 模态相位面（值 = browser|repick|form|executing|success|failure） */
export const addProjectPhase = (phase: string): string =>
  `.dswf-ap[data-dswf-ap="${phase}"]`
/** 模态本体（任意相位） */
export const AP_ANY = '.dswf-ap'
/** 注册表单字段（值 = ws|name|forge|kn|tasks） */
export const rfField = (field: string): string => `[data-dswf-rf-${field}]`
/** 注册表单字段级校验提示（值 = 字段名） */
export const rfIssue = (field: string): string => `[data-dswf-rf-issue="${field}"]`
/** 注册表单浏览改选面（值 = browsing + target） */
export const rfBrowsing = (target: string): string =>
  `[data-dswf-rf="browsing"][data-dswf-rf-target="${target}"]`
/** 文件浏览器列举失败态 */
export const FB_ERROR = '[data-dswf-fb-error]'

// ── M2 forge 管线（UF-1 概览 / UF-2 文档 / UF-3 挂接 pill / UF-4 派生行——5.2 台账） ──

/** 概览 dock tab 面板（dswf-overview body 根） */
export const OV_PANEL = '[data-dswf-ov-panel]'
/** 概览子 tab（值 = proposals|features|tasks；aria-selected 激活态断言） */
export const ovSubtabOf = (subtab: string): string => `[data-dswf-ov-subtab="${subtab}"]`
/** 概览文档行（值 = rel_path——提案/feature 子 tab 共用行语言） */
export const ovDocRowOf = (docRel: string): string => `[data-dswf-ov-doc="${docRel}"]`
/** 概览父行（提案/feature 展开钮——值 = 行键） */
export const OV_PARENT_ANY = '[data-dswf-ov-parent]'
/** 任务子 tab 三视图切换（值 = list|swim|dag） */
export const ttViewOf = (view: string): string => `[data-dswf-tt-view="${view}"]`
/** 任务列表行（值 = taskId） */
export const ttItemOf = (taskId: string): string => `[data-dswf-tt-item="${taskId}"]`
/** 泳道列（值 = 七态之一） */
export const ttColOf = (status: string): string => `[data-dswf-tt-col="${status}"]`
/** 泳道卡片（值 = taskId） */
export const ttCardOf = (taskId: string): string => `[data-dswf-tt-card="${taskId}"]`
/** feature 绑定 pill（值 = featureSlug——任务子 tab taskbar） */
export const ttFeatpillOf = (slug: string): string => `[data-dswf-tt-featpill="${slug}"]`
/** 任务抽屉（右栏概览装配体内——role=dialog） */
export const TD_DRAWER = '[data-dswf-td-drawer]'
/** 文档 tab 面板（任意） */
export const DOC_PANEL_ANY = '[data-dswf-doc-panel]'
/** 文档 tab 面板（值锚 data-dswf-doc-key = `<projectId>#<docRel>`——去重键同源） */
export const docPanelOf = (projectId: string, docRel: string): string =>
  `[data-dswf-doc-key="${projectId}#${docRel}"]`
/** 悬空文档占位面（SC-branch 容错锚） */
export const DOC_DANGLING = '[data-dswf-doc-dangling]'
/** mermaid 渲染成功面（SVG 在场——erDiagram 验收锚） */
export const DOC_MERMAID_SVG = '[data-dswf-doc-mermaid-svg]'
/** mermaid 渲染回退占位卡（非法源/渲染失败） */
export const DOC_MERMAID_FALLBACK = '[data-dswf-doc-mermaid-fallback]'
/** 会话头挂接 pill（任意） */
export const STP_PILL_ANY = '[data-dswf-stp-pill]'
/** 会话头挂接 pill 双源分型（值对 = taskId × source[link|record]——SC6③ 锚） */
export const stpPillOf = (taskId: string, source: string): string =>
  `[data-dswf-stp-pill="${taskId}"][data-dswf-stp-source="${source}"]`
/** 注册表单派生行（值 = loading|ready|suspected-move|error——4.3 四态） */
export const dsrOf = (state: string): string => `[data-dswf-dsr="${state}"]`
/** 派生行 ready 路径逐字呈现面（SC2 单源断言读取位） */
export const DSR_DIR = '[data-dswf-dsr-dir]'
/** 派生行错误条（疑似移动手工指引/通用兜底共载体） */
export const DSR_ERROR = '[data-dswf-dsr-error]'
