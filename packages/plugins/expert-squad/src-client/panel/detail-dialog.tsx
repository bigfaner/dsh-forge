// panel/detail-dialog —— 详情 Dialog（ui-design F2 查看/编辑双模式产品实现）：
// 头部（状态灯 + 名称 + 英文标识 chip + 启停/编辑/保存 + ✕——启停钮查看态在场、编辑态
// 隐藏）、查看态分段（岗位·启停 meta
// → 简介 → 人设 Markdown 渲染 → 工具白名单 chips → 技能 chips）、编辑态字段集（岗位
// Input / 简介 textarea 2→6 行 120 字上限 / 人设 textarea 12→100 行自适应 / multi-select
// ×2——工具上技能下、技能可新增；provider/model = FilterSelect 单选（选项值 =「设置>模型」
// 目录，model-catalog 惰性装载；model 选项随所选 provider 联动）；下拉菜单 position:fixed
// 视口锚定（可溢出 Dialog 视觉范围，不被 body overflow 裁切）。
// Dialog 可拖动（头部 pointer 拖拽——位移落 absolute left/top，不用 transform：transformed
// 祖先会成为 fixed 菜单的包含块致错位）+ 可拉伸（CSS resize both，右下角手柄）。
// Esc / 遮罩 / ✕ 关闭。
// 官方 MarkdownDoc 组件不在插件 client bundle 外置表内（classic script 缝仅 react
// 外置），按原型近似语义以 .dswf-* 自绘面分块渲染（标题/加粗/行内代码/列表）。

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import {
  DESCRIPTION_MAX,
  MSEL_MENU_MAX_PX,
  personaBlocks,
  TOOL_CANDIDATES,
  type MdInline,
} from "./detail-logic.js";
import { maskedPeersLabel, diffFields, entryIdOf, originLabel, type ExpertView } from "./filter.js";
import {
  DiffOnlyToggle,
  PairCompareTable,
  useDiffOnly,
} from "./compare-table.js";
import { escNext, type ExpertDetailController, type DetailState } from "./detail-source.js";
import { ExpertIcon } from "./expert-icon.js";
import { FilterSelect } from "./filter-select.js";
import {
  modelOptionsOf,
  providerOptionsOf,
  type ModelCatalogEntry,
} from "./model-catalog.js";

/**
 * Dialog 拖拽纯决策（头部 pointer 拖拽）：起点锚 + 起始位置 + 当前指针位 → 新位置。
 * 位移承载 = absolute left/top（overlay 视口系）——不用 transform：transformed 祖先会成为
 * fixed 后代的包含块，msel/FilterSelect 菜单（position:fixed 视口锚定）坐标会被重解释错位。
 */
export function dialogDragPos(
  start: { readonly px: number; readonly py: number; readonly left: number; readonly top: number },
  px: number,
  py: number,
): { left: number; top: number } {
  return { left: start.left + (px - start.px), top: start.top + (py - start.py) };
}

/** 头部拖拽 hooks 绑定面（位置态 + pointer 事件组；按钮点击不启动拖拽）。 */
export interface DialogDrag {
  /** undefined = 未拖拽（维持 flex 居中）；拖拽起 = 钉在当前视口位（absolute）随动。 */
  readonly pos: { left: number; top: number } | undefined;
  onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
  onPointerUp(): void;
}

/** 头部拖拽 state 机（详情 Dialog 可拖动——setPointerCapture 跟手，位移落 left/top）。 */
export function useDialogDrag(): DialogDrag {
  const [pos, setPos] = useState<{ left: number; top: number } | undefined>(undefined);
  const dragRef = useRef<{ px: number; py: number; left: number; top: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if ((event.target as HTMLElement | null)?.closest("button") !== null) return;
    // 起拖即钉位：以 Dialog 当前视口矩形为锚（overlay 通栏，absolute 视口系同值零跳位）
    const dlg = event.currentTarget.closest(".dswf-dlg");
    const rect = dlg?.getBoundingClientRect();
    if (rect === undefined) return;
    const start = { px: event.clientX, py: event.clientY, left: rect.left, top: rect.top };
    dragRef.current = start;
    setPos({ left: start.left, top: start.top });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const start = dragRef.current;
    if (start === null) return;
    setPos(dialogDragPos(start, event.clientX, event.clientY));
  };
  const onPointerUp = (): void => {
    dragRef.current = null;
  };
  return { pos, onPointerDown, onPointerMove, onPointerUp };
}

/** textarea 行高刻度（Body 14/22——官方排版令牌行高，autosize 上下界按行数换算）。 */
const TEXTAREA_LINE_PX = 22;

/** 简介 textarea：默认 1 行起步（行高 + 上下 padding——scrollHeight 含 padding，min 须同口径）、最多 6 行自适应（内容上限 120 字不变）。 */
const DESCRIPTION_MIN_PX = TEXTAREA_LINE_PX * 1 + 16;
const DESCRIPTION_MAX_PX = TEXTAREA_LINE_PX * 6 + 2;

/** 人设 textarea：默认 12 行、最多 100 行自适应，滚动上界兜底。 */
const PERSONA_MIN_PX = TEXTAREA_LINE_PX * 12 + 2;
const PERSONA_MAX_PX = TEXTAREA_LINE_PX * 100 + 2;

/** 全目录技能候选面（multi-select 技能下拉 + 面板汇总注入）。 */
export type AllSkills = readonly string[];

/** msel 菜单未测量首帧兜底样式（隐藏先测量——不落 static 位置跳位）。 */
const MSEL_MENU_HIDDEN = { visibility: "hidden" } as const;

/**
 * 自适应 textarea（min 行起步；值变化即按 scrollHeight 增高至 max 上界，超出滚动兜底）——
 * 高度 = clamp(scrollHeight, minPx, maxPx)：不固定行数，内容一行显完整时域框即一行。
 */
function AutoTextarea(props: {
  readonly value: string;
  readonly minPx: number;
  readonly maxPx: number;
  readonly onChange: (value: string) => void;
  readonly ariaLabel: string;
}): ReactNode {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.style.height = "auto"; // 先归零再测量——收缩与增长双向跟随
    el.style.height = `${Math.min(Math.max(el.scrollHeight, props.minPx), props.maxPx)}px`;
  }, [props.value, props.minPx, props.maxPx]);
  return (
    <textarea
      ref={ref}
      className="dswf-dlg-textarea"
      aria-label={props.ariaLabel}
      rows={1}
      maxLength={props.maxPx === DESCRIPTION_MAX_PX ? DESCRIPTION_MAX : undefined}
      style={{ minHeight: props.minPx, maxHeight: props.maxPx, overflowY: "auto" }}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

/** 行内片段渲染（加粗 / 行内代码 / 纯文本）。 */
function Inline({ parts }: { readonly parts: readonly MdInline[] }): ReactNode {
  return (
    <>
      {parts.map((part, index) => {
        if (part.t === "b") return <strong key={index}>{part.v}</strong>;
        if (part.t === "code") return <code key={index}>{part.v}</code>;
        return <span key={index}>{part.v}</span>;
      })}
    </>
  );
}

/** 人设 Markdown 分块渲染（标题/加粗/行内代码/列表）。 */
function PersonaMd({ source }: { readonly source: string }): ReactNode {
  const blocks = personaBlocks(source);
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length > 0) {
      out.push(<ul key={`ul-${out.length}`}>{list}</ul>);
      list = [];
    }
  };
  blocks.forEach((block, index) => {
    if (block.kind === "li") {
      list.push(
        <li key={index}>
          <Inline parts={block.inline ?? []} />
        </li>,
      );
      return;
    }
    flush();
    if (block.kind === "heading") {
      out.push(
        <strong key={index} className="dswf-dlg-md-h">
          <Inline parts={block.inline ?? []} />
        </strong>,
      );
    } else if (block.kind === "table") {
      // GFM 管道表格（test-runner 等内置人设含生命周期映射表）——wrap 承担超宽横滚，
      // table 本体 margin auto 居中（display:table 收敛内容宽）
      out.push(
        <div key={index} className="md-table-wrap">
          <table className="md-table">
          <thead>
            <tr>
              {(block.header ?? []).map((cell, ci) => (
                <th key={ci}>
                  <Inline parts={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(block.rows ?? []).map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>
                    <Inline parts={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          </table>
        </div>,
      );
    } else if (block.kind === "code") {
      // bug b29f77e7：官方 MarkdownDoc 代码块结构镜像（.md-code-block +
      // data-code-block-content 锚 + pre>code）——md-mermaid 全局 DOM 增强器
      // （壳 apply 期启动、观察 body 子树）按内容判据扫此结构出 mermaid 图
      // （渲染成功旁插 figure 并隐藏原块；失败/非 mermaid 维持代码块现状）。
      out.push(
        <div key={index} className="md-code-block" data-code-wrap={block.lang || undefined}>
          <div data-code-block-content>
            <pre>
              <code>{block.source}</code>
            </pre>
          </div>
        </div>,
      );
    } else {
      out.push(
        <div key={index}>
          <Inline parts={block.inline ?? []} />
        </div>,
      );
    }
  });
  flush();
  return <>{out}</>;
}

/**
 * multi-select 开合纯决策（原型 mountMsel 语义）：box 点击开合、点击 wrap 外部收起、
 * 内部点击（勾选行/新增输入）保持展开。
 */
export function mselNextOpen(
  open: boolean,
  area: "box" | "outside" | "inside",
): boolean {
  if (area === "box") return !open;
  if (area === "outside") return false;
  return open;
}

/**
 * document 外点收起监听装配（捕获阶段）。
 * Root cause: Dialog 的 React 合成 stopPropagation 在 React root 委托处停掉原生
 * click，冒泡期挂 document 的监听收不到 Dialog 内任何点击——外点收起对 Dialog 内
 * 点击恒失效。捕获阶段先于 root 委托触发，Dialog 内非 msel 点击照常视为「外部」。
 */
export function attachMselCollapse(
  doc: {
    addEventListener(type: string, listener: (event: unknown) => void, capture: boolean): void;
    removeEventListener(type: string, listener: (event: unknown) => void, capture: boolean): void;
  },
  root: () => { contains(target: unknown): boolean } | null,
  setOpen: (updater: (current: boolean) => boolean) => void,
): () => void {
  const onDocClick = (event: unknown): void => {
    const r = root();
    const target = (event as { target?: unknown })?.target;
    if (r && r.contains(target)) {
      setOpen((current) => mselNextOpen(current, "inside"));
      return;
    }
    setOpen((current) => mselNextOpen(current, "outside"));
  };
  doc.addEventListener("click", onDocClick, true);
  return () => doc.removeEventListener("click", onDocClick, true);
}

/**
 * 裁定留档（AGENTS §1.2 复用优先）：官方 @deepseek-ai/dsh-client-ui-primitives Menu
 * portal 模式已读（Menu.module.css:37 fixed portal、index.js:3870 先测量、3971-4005
 * 等值短路、4444-4455 锚定跟随）——与本项目 msel placement 同语义，git-worktree 插件
 * 亦有直接消费先例。仍维持自绘 msel 面：①对齐已批原型 .dswf-msel-* 形态（官方 Menu
 * 视觉/结构词汇不同，迁移即偏离已批原型）；②整体迁移官方 Menu 是组件级更大改动，
 * 超出本缺陷修复范围，另行评估。故自绘实现按官方语义补齐四项加固（先测量隐藏、
 * 视口封顶、等值短路、锚定跟随）。
 */
/**
 * multi-select 菜单 placement 纯决策（fixed 视口锚定）：
 * 下方空间足够 → below（top = box 底 + 4）；下方不足且上方更宽裕 → above
 * （bottom = 视口高 - box 顶 + 4）。maxHeight 按上下两侧更宽裕侧 - 4 封顶
 * （双侧均不足时不溢出视口）。坐标一律视口系——菜单 position:fixed 挂 viewport，
 * 不受 Dialog body overflow 裁切。
 */
export function mselMenuPlacement(
  box: { top: number; bottom: number; left: number; width: number },
  viewportHeight: number,
  maxMenuPx = MSEL_MENU_MAX_PX,
): {
  side: "below" | "above";
  style: { left: number; width: number; maxHeight: number; top?: number; bottom?: number };
} {
  const below = viewportHeight - box.bottom;
  const above = box.top;
  const base = {
    left: box.left,
    width: box.width,
    // 极小视口两侧均负 → Math.max(0,…) 兜底（maxHeight 负值非法，回退零高）
    maxHeight: Math.min(maxMenuPx, Math.max(0, Math.max(below, above) - 4)),
  };
  if (below < maxMenuPx && above > below && above - 4 > 0) {
    // bug 207b7579：maxHeight 已按 Math.max(0,…) 兜底，判向不得再读原始负值——
    // 上方无正可用空间（above-4 ≤ 0）时不翻 above（0 高菜单不落 above 展开态），兜底 below
    return { side: "above", style: { ...base, bottom: viewportHeight - box.top + 4 } };
  }
  return { side: "below", style: { ...base, top: box.bottom + 4 } };
}

/** msel 菜单 style 等值判据（place() 短路——坐标不变不 setState，官方 Menu 同语义）。 */
export function mselMenuStyleEqual(
  a: { left: number; width: number; maxHeight: number; top?: number; bottom?: number },
  b: { left: number; width: number; maxHeight: number; top?: number; bottom?: number },
): boolean {
  return (
    a.left === b.left &&
    a.width === b.width &&
    a.maxHeight === b.maxHeight &&
    a.top === b.top &&
    a.bottom === b.bottom
  );
}

/**
 * multi-select：box 显已选 chips + 下拉勾选菜单（allowAdd 技能可新增）。
 * 对齐已批原型：菜单默认收起（条件渲染），box 点击开合，document 外点收起。
 * Root cause: 产品实现曾恒渲染菜单（无 open 态），偏离原型 mountMsel 交互。
 * 菜单 position:fixed 视口锚定（mselMenuPlacement 坐标 + scroll/resize 跟随）——
 * absolute 菜单被 .dswf-dlg-body overflow:auto 裁切（真机回归），fixed 脱离该
 * 滚动容器的裁切上下文、允许溢出 Dialog 视觉范围。
 */
function MultiSelect(props: {
  readonly field: "tools" | "skills";
  readonly label: string;
  readonly selected: readonly string[];
  readonly candidates: readonly string[];
  readonly allowAdd: boolean;
  readonly defaultOpen?: boolean;
  readonly onToggle: (value: string) => void;
  readonly onAdd: (value: string) => void;
}): ReactNode {
  const [open, setOpen] = useState(props.defaultOpen === true);
  const [menuStyle, setMenuStyle] = useState<
    { left: number; width: number; maxHeight: number; top?: number; bottom?: number } | undefined
  >(undefined);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    // 捕获阶段挂载（attachMselCollapse 注记——冒泡期监听被 Dialog 合成 stopPropagation 截停）
    return attachMselCollapse(document, () => rootRef.current, setOpen);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    // fixed 定位：box 视口矩形 → 菜单坐标；Dialog body 滚动（capture）与窗口 resize 跟随
    const place = (): void => {
      const box = boxRef.current;
      if (box === null) return;
      const next = mselMenuPlacement(box.getBoundingClientRect(), window.innerHeight).style;
      // 等值短路（官方 Menu 同语义）：坐标不变不 setState——滚动/resize 逐帧 re-render 消除
      setMenuStyle((prev) => (prev !== undefined && mselMenuStyleEqual(prev, next) ? prev : next));
    };
    // m1：useLayoutEffect——paint 前完成首次测量定位（首帧不落 static 位置跳位）；
    // 渲染面以 visibility:hidden 兜底未测量首帧（官方 Menu MEASURE_STYLE 同语义）。
    place();
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  const options = [...new Set([...props.candidates, ...props.selected])];
  return (
    <div className="dswf-dlg-field">
      <label>{props.label}</label>
      <div
        ref={rootRef}
        className={open ? "dswf-msel dswf-msel-open" : "dswf-msel"}
        data-msel={props.field}
        data-msel-open={open ? "" : undefined}
      >
        <div
          ref={boxRef}
          className="dswf-msel-box"
          onClick={() => setOpen((current) => mselNextOpen(current, "box"))}
        >
          {props.selected.map((value) => (
            <span key={value} className="chip" data-msel-chip={value}>
              {value}
            </span>
          ))}
          <span className="dswf-msel-placeholder">
            {props.selected.length === 0 ? "点击选择" : ""}
          </span>
          <span className="dswf-msel-caret">▾</span>
        </div>
        {open ? (
          <div
            className="dswf-msel-menu"
            style={menuStyle ?? MSEL_MENU_HIDDEN}
            data-msel-menu={props.field}
          >
            {options.map((option) => (
              <label key={option} className="dswf-msel-row">
                <input
                  type="checkbox"
                  checked={props.selected.includes(option)}
                  onChange={() => props.onToggle(option)}
                />
                {option}
              </label>
            ))}
            {props.allowAdd ? (
              <div className="dswf-msel-add">
                <input
                  type="text"
                  placeholder="新增后回车"
                  aria-label="新增技能"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      props.onAdd((event.target as HTMLInputElement).value);
                      (event.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 来源行（1.67 裁决：降位弱化版——去「生效」徽标：生效序判定依赖当前项目语境，
 * Dialog 无法判定用户在哪个项目；来源行移入头部标识行（名称+slug）下一行，次级色弱化；
 * 内置/user 来源尾缀 ? 图标，hover tooltip 解释来源语义——dswf-tip 深色气泡
 * （DESIGN Tooltip 令牌——原生 title 退役，风格统一裁决 2026-10-26），project 来源无 ?。
 */
const ORIGIN_HELP: Readonly<Record<string, string>> = {
  plugin: "随插件分发的兜底档案",
  user: "当前用户全局档案（跨项目共享）",
};

function OriginBar({
  expert,
  shadows,
  projectName,
}: {
  readonly expert: ExpertView;
  readonly shadows: readonly ExpertView[];
  readonly projectName?: string;
}): ReactNode {
  const masked = maskedPeersLabel(shadows);
  const help = ORIGIN_HELP[expert.origin];
  return (
    <div className="dswf-dlg-origin-bar" data-dswf-origin-bar="">
      <span className="dswf-dlg-origin-lead">来源</span>
      <span className={`origin-badge origin-${expert.origin}`}>
        {originLabel(expert.origin, projectName)}
      </span>
      {help === undefined ? null : (
        <span
          className="dswf-dlg-origin-help dswf-tip"
          data-dswf-origin-help={expert.origin}
          data-tip={help}
          aria-label={help}
        >
          ?
        </span>
      )}
      {masked === undefined ? null : <span className="dswf-dlg-origin-masked">{masked}</span>}
    </div>
  );
}

/** 两两对比态 body（③⑥：对象单选列表——Dialog 形态唯一选择控件，chips 为聚组展开语汇不在此；差异默认表 + 退出回查看）。 */
function CompareBody({
  state,
  effective,
  shadows,
  projectName,
  controller,
}: {
  readonly state: DetailState;
  /** 对比左列生效条（bug e1d74589：同自 sameKeyEntries 按 effective 位重解析——与右列同代际）。 */
  readonly effective?: ExpertView;
  readonly shadows: readonly ExpertView[];
  readonly projectName?: string;
  readonly controller: ExpertDetailController;
}): ReactNode {
  const { showAll, toggle } = useDiffOnly();
  // Root cause（bug f4020406 ⑥）：state 只存对比靶身份（compareTargetOrigin = 
  // entryIdOf——sourcePath），渲染时从同键最新条目重解析——轮询换新后对比表随
  // sameKeyEntries 自动换新，不读陈旧快照。
  const target = state.compareTargetOrigin === undefined
    ? undefined
    : shadows.find((shadow) => entryIdOf(shadow) === state.compareTargetOrigin);
  // 对比对象消失自动退场：同键已无其它来源（shadows 空）→ 自动回查看态——不留
  // 「对比对象已不在」死页，对比入口（卡头对比钮）本就随 multi 消失，此处兜底
  // 打开/展示间隙来源消失的窗口期。
  useEffect(() => {
    if (shadows.length === 0) controller.exitCompare();
  });
  return (
    <>
      <div className="dswf-cmp-pick-head">
        <b>对比</b>
        <span>点选同键其它来源，逐字段两两比对</span>
      </div>
      <div className="dswf-cmp-pick-list">
        {shadows.map((shadow) => (
          <button
            key={entryIdOf(shadow)}
            type="button"
            className={`dswf-cmp-opt${target !== undefined && entryIdOf(target) === entryIdOf(shadow) ? " sel" : ""}`}
            data-cmp-target={entryIdOf(shadow)}
            onClick={() => controller.selectCompareTarget(shadow)}
          >
            <span className={`origin-badge origin-${shadow.origin}`}>{originLabel(shadow.origin, projectName)}</span>
            <span>{shadow.title}</span>
            <span className="dswf-cmp-opt-updated">{shadow.updatedAt?.slice(0, 10) ?? "随包分发"}</span>
          </button>
        ))}
      </div>
      {effective === undefined ? (
        // bug 207b7579①：生效位缺失（sameKeyEntries 非空但无 effective 位）——左列失靶
        // 空态，不回落 open 期陈旧快照（幻影 diff 根源地）
        <div className="dswf-cmp-empty" data-dswf-cmp-stale="effective">
          生效档案已不在，请重选
        </div>
      ) : target === undefined ? (
        // 失靶空态：对比对象被删/刷新消失——引导重选，不渲染残缺对比表
        <div className="dswf-cmp-empty">对比对象已不在，请重选</div>
      ) : (
        <>
          <DiffOnlyToggle
            showAll={showAll}
            diffCount={diffFields(effective, target).length}
            onToggle={toggle}
          />
          <PairCompareTable
            effective={effective}
            shadow={target}
            showAllFields={showAll}
            projectName={projectName}
          />
        </>
      )}
    </>
  );
}

/** 详情 Dialog 呈递件（控制器驱动；F2 组件树逐位）。 */
export function ExpertDetailDialog(props: {
  readonly controller: ExpertDetailController;
  /** 工具白名单候选（1.78：宿主 ToolRuntime 目录透出；缺席 = 内置兜底清单）。 */
  readonly toolCandidates?: readonly string[];
  readonly allSkills: AllSkills;
  /** multi-select 初始展开态（SSR 测试/调试面；默认收起 = 原型语义）。 */
  readonly mselDefaultOpen?: boolean;
  /** 同键全层条目（1.61 裁决①③：来源置顶条 + 两两对比对象源；缺席 = 旧装配降级无来源条）。 */
  readonly sameKeyEntries?: readonly ExpertView[];
  /** 项目具名（④：workspace 路径 basename——来源角标/提示具名「项目 · <名>」）。 */
  readonly projectName?: string;
  /** 「设置>模型」目录（provider/model 下拉选项源；缺席 = 仅回落继承空选项）。 */
  readonly modelCatalog?: readonly ModelCatalogEntry[];
}): ReactNode {
  const drag = useDialogDrag();
  const state = useSyncExternalStore(
    props.controller.subscribe.bind(props.controller),
    props.controller.getSnapshot.bind(props.controller),
    props.controller.getSnapshot.bind(props.controller),
  );
  const editing = state.mode === "edit";
  const comparing = state.mode === "compare";
  const expert = state.expert;
  // 被遮蔽同名卡（对比对象源）：同键条目中非当前呈现的只读层。身份判别 = entryIdOf
  // （sourcePath——同 origin 多份内置注册下 origin 比较会误伤同源条目，缺陷根源）。
  // bug 13f807c4 注记①（容忍语义）：在场条目缺 effective 位（旧载荷）≠ 被删——
  // 容忍渲染快照继续呈现，仅对比左列因生效位缺失禁用/空态（bug 207b7579①），非漏改。
  const shadows = (props.sameKeyEntries ?? []).filter(
    (peer) => entryIdOf(peer) !== entryIdOf(expert) && peer.effective !== true,
  );
  // bug e1d74589：对比左列生效条同自 sameKeyEntries 按 effective 位重解析——
  // state.expert 是 open 期快照（仅 save/toggleEnabled 换新），外部改动后与右列
  // （渲染时重解析）代际错位出幻影 diff；无显式生效位条目时回落快照（旧载荷容忍）。
  // bug 207b7579①：生效位缺失不再回落 open 期快照——按失靶处理（对比入口禁用/对比态空态）。
  // bug 207b7579②：主体失靶守卫——sameKeyEntries 在场且不含打开条目 = 专家已被删；
  // 守卫为渲染期派生，轮询换新恢复条目后自动收敛。
  const compareEffective = props.sameKeyEntries?.find((entry) => entry.effective === true);
  // bug 13f807c4 注记②（装配不变量）：空数组判已删依赖两条不变量——
  // ① sameKeyEntries 由 expert-panel 渲染期从 list-source 快照派生（非缓存态）；
  // ② list-source 拉取失败静默保持既有快照、不瞬态清空 entries——空数组只可能
  // 来自服务端真返回空（条目已删），而非加载失败误伤。
  const stale =
    props.sameKeyEntries !== undefined &&
    !props.sameKeyEntries.some((entry) => entry.origin === expert.origin);
  // bug 13f807c4：渲染期派生 stale 回落控制器（save/toggleEnabled 短路面）——
  // setStale 不改快照、等值短路，渲染期调用幂等无副作用（见 detail-source 注记）。
  props.controller.setStale(stale);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      // bug f4020406 ⑤：Esc 决策走 escNext——对比态先 exitCompare 回查看态，再按才关 Dialog
      if (escNext(props.controller.getSnapshot().mode) === "exitCompare") {
        props.controller.exitCompare();
        return;
      }
      props.controller.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.controller]);

  const body = stale ? (
    // bug 207b7579②：打开条目已被删——查看态失靶提示，不渲染陈旧快照主体
    <div className="dswf-cmp-empty" data-dswf-stale="">
      该专家已不存在
    </div>
  ) : comparing ? (
    <CompareBody
      state={state}
      effective={compareEffective}
      shadows={shadows}
      projectName={props.projectName}
      controller={props.controller}
    />
  ) : editing ? (
    <>
      <div className="dswf-dlg-field" data-field="title">
        <label>岗位</label>
        <input
          type="text"
          className="dswf-dlg-input"
          aria-label="岗位"
          value={state.draft.title}
          onChange={(event) => props.controller.setField("title", event.target.value)}
        />
        {state.errors.title === undefined ? null : <div className="dswf-dlg-err">{state.errors.title}</div>}
      </div>
      <div className="dswf-dlg-field" data-field="description">
        <label>简介（模型选人依据：何时委派我 · 默认 1 行自适应，最多 6 行 ≈ 120 字）</label>
        <AutoTextarea
          value={state.draft.description}
          minPx={DESCRIPTION_MIN_PX}
          maxPx={DESCRIPTION_MAX_PX}
          ariaLabel="简介"
          onChange={(value) => props.controller.setField("description", value)}
        />
      </div>
      <div className="dswf-dlg-field" data-field="personaMd">
        <label>人设（Markdown 自由输入 · 派发时作为 persona 注入子会话 · 默认 12 行，最多 100 行）</label>
        <AutoTextarea
          value={state.draft.personaMd}
          minPx={PERSONA_MIN_PX}
          maxPx={PERSONA_MAX_PX}
          ariaLabel="人设"
          onChange={(value) => props.controller.setField("personaMd", value)}
        />
        {state.errors.personaMd === undefined ? null : (
          <div className="dswf-dlg-err">{state.errors.personaMd}</div>
        )}
      </div>
      {/* provider/model 成对编辑（官方 AgentOptions 同给同缺；只填其一保存时成对校验拦截）——
          同行双列（dswf-dlg-row）；选项值 =「设置>模型」目录（remote.session.modelCatalog——
          m3.1 D25 同源口径；目录缺席/值不在目录 = box 显当前值，继承父Agent 空选项恒在场）。 */}
      <div className="dswf-dlg-row" data-field="provider-model">
        <div className="dswf-dlg-field" data-field="provider">
          <label>Provider（派发路由 · 清空 = 继承父Agent）</label>
          <FilterSelect
            id="dswf-dlg-provider"
            ariaLabel="Provider"
            value={state.draft.provider}
            options={providerOptionsOf(props.modelCatalog)}
            onChange={(value) => props.controller.setField("provider", value)}
          />
          {state.errors.provider === undefined ? null : (
            <div className="dswf-dlg-err">{state.errors.provider}</div>
          )}
        </div>
        <div className="dswf-dlg-field" data-field="model">
          <label>Model（派发模型偏好）</label>
          <FilterSelect
            id="dswf-dlg-model"
            ariaLabel="Model"
            value={state.draft.model}
            options={modelOptionsOf(props.modelCatalog, state.draft.provider)}
            onChange={(value) => props.controller.setField("model", value)}
          />
          {state.errors.model === undefined ? null : (
            <div className="dswf-dlg-err">{state.errors.model}</div>
          )}
        </div>
      </div>
      <MultiSelect
        field="tools"
        label="工具（子会话强制生效 · 多选）"
        selected={state.draft.tools}
        // 兜底双写注记：toolCandidates prop 已在装配侧经 toolCandidatesOf 兜底
        // （目录缺席 → TOOL_CANDIDATES）；此处 `?? TOOL_CANDIDATES` 是 prop 缺席
        // 形态（旧调用方/透传断链）的二次兜底——双写有意保留，非冗余。
        candidates={props.toolCandidates ?? TOOL_CANDIDATES}
        allowAdd={false}
        defaultOpen={props.mselDefaultOpen}
        onToggle={(value) => props.controller.toggleTool(value)}
        onAdd={() => undefined}
      />
      <MultiSelect
        field="skills"
        label="技能（多选，可新增）"
        selected={state.draft.skills}
        candidates={props.allSkills}
        allowAdd={true}
        defaultOpen={props.mselDefaultOpen}
        onToggle={(value) => props.controller.toggleSkill(value)}
        onAdd={(value) => props.controller.appendSkill(value)}
      />
    </>
  ) : (
    <>
      {/* body 首行：岗位 meta 居左 + 派发路由 chips 靠右（详情态专属；成对在场 =
          provider·model 双 chip，缺省 = 「继承父Agent」弱化 chip） */}
      <div className="dswf-dlg-lead">
        <div className="dswf-dlg-meta">
          {expert.title} · {expert.enabled ? "启用中" : "已禁用"}
        </div>
        {!comparing && !editing ? (
          <span className="dswf-dlg-route-chips" data-dswf-dlg-route="">
            {expert.provider !== undefined && expert.model !== undefined ? (
              <>
                <span className="chip tool">{expert.provider}</span>
                <span className="chip">{expert.model}</span>
              </>
            ) : (
              // 未显式指定 = 固定前缀标明语义位（model）；显式选中 model 时双 chip 自明，不带前缀
              <span className="chip dswf-chip-muted">model : 继承父Agent</span>
            )}
          </span>
        ) : null}
      </div>
      <div className="dswf-dlg-seg">简介（何时委派我）</div>
      <div className="dswf-dlg-meta">{expert.description}</div>
      <div className="dswf-dlg-seg">人设（Persona · 派发时注入子会话）</div>
      <div className="dswf-dlg-md">
        <PersonaMd source={expert.personaMd} />
      </div>
      <div className="dswf-dlg-seg">工具（子会话强制生效）</div>
      <div className="dswf-dlg-chips">
        {expert.tools.map((tool) => (
          <span key={tool} className="chip tool">
            {tool}
          </span>
        ))}
      </div>
      <div className="dswf-dlg-seg">技能</div>
      <div className="dswf-dlg-chips">
        {expert.skills.map((skill) => (
          <span key={skill} className="chip">
            {skill}
          </span>
        ))}
      </div>
    </>
  );

  return (
    <div
      className="dswf-dlg-overlay"
      data-dswf-detail-dialog=""
      onClick={() => props.controller.close()}
    >
      <div
        className={comparing ? "dswf-dlg wide" : "dswf-dlg"}
        role="dialog"
        aria-label={`专家详情 ${expert.name}`}
        style={drag.pos === undefined ? undefined : { position: "absolute", margin: 0, left: drag.pos.left, top: drag.pos.top }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="dswf-dlg-head"
          data-dswf-dlg-drag-handle=""
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
        >
          <div className="dswf-dlg-head-row">
            <ExpertIcon size={16} />
            <span className={`dot ${expert.enabled ? "on" : "off"}`} />
            <b className="dswf-dlg-name">{expert.name}</b>
            <span className="dswf-dlg-head-actions">
            {comparing ? (
              <button
                type="button"
                className="dswf-btn dswf-btn-ghost"
                aria-label="退出对比"
                onClick={() => props.controller.exitCompare()}
              >
                返回
              </button>
            ) : editing ? (
              <button
                type="button"
                className="dswf-btn dswf-btn-primary"
                // bug 13f807c4：stale（条目已被删）禁用保存——update 为 upsert，
                // 放行即复活已删条目；控制器层另有短路面防入口绕过
                disabled={state.busy || stale}
                onClick={() => void props.controller.save()}
              >
                保存
              </button>
            ) : (
              <>
                {shadows.length === 0 ? null : (
                  <button
                    type="button"
                    className="dswf-btn dswf-btn-ghost"
                    aria-label="对比"
                    disabled={stale || compareEffective === undefined}
                    onClick={() => props.controller.startCompare(shadows[0]!)}
                  >
                    对比
                  </button>
                )}
                <button
                  type="button"
                  className="dswf-btn dswf-btn-ghost"
                  disabled={stale}
                  onClick={() => props.controller.startEdit()}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="dswf-btn dswf-btn-ghost"
                  data-dswf-toggle-enabled=""
                  disabled={state.busy || stale}
                  onClick={() => void props.controller.toggleEnabled()}
                >
                  {expert.enabled ? "禁用" : "启用"}
                </button>
              </>
            )}
            <button
              type="button"
              className="dswf-btn dswf-btn-ghost"
              aria-label="关闭"
              onClick={() => props.controller.close()}
            >
              ✕
            </button>
          </span>
          </div>
          {props.sameKeyEntries === undefined ? null : (
            <OriginBar expert={expert} shadows={shadows} projectName={props.projectName} />
          )}
        </div>
        <div className="dswf-dlg-body">{body}</div>
        {state.toast === undefined ? null : (
          <div className="dswf-toast" role="status">
            {state.toast}
          </div>
        )}
      </div>
    </div>
  );
}

/** 控制器 hooks 绑定辅助（expert-panel 装配消费；类型回流用）。 */
export type DetailControllerLike = ExpertDetailController;
export type DetailStateView = DetailState;
