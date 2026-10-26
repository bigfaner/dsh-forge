// panel/detail-dialog —— 详情 Dialog（ui-design F2 查看/编辑双模式产品实现）：
// 头部（状态灯 + 名称 + 英文标识 chip + 启停/编辑/保存 + ✕——启停钮查看态在场、编辑态
// 隐藏）、查看态分段（岗位·启停 meta
// → 简介 → 人设 Markdown 渲染 → 工具白名单 chips → 技能 chips）、编辑态字段集（岗位
// Input / 简介 textarea 2→6 行 120 字上限 / 人设 textarea 12→100 行自适应 / multi-select
// ×2——工具上技能下、技能可新增；下拉菜单 position:fixed 视口锚定（可溢出 Dialog
// 视觉范围，不被 body overflow 裁切）。
// Esc / 遮罩 / ✕ 关闭。
// 官方 MarkdownDoc 组件不在插件 client bundle 外置表内（classic script 缝仅 react
// 外置），按原型近似语义以 .dswf-* 自绘面分块渲染（标题/加粗/行内代码/列表）。

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import {
  DESCRIPTION_MAX,
  personaBlocks,
  TOOL_CANDIDATES,
  type MdInline,
} from "./detail-logic.js";
import { maskedPeersLabel, diffFields, originLabel, type ExpertView } from "./filter.js";
import {
  DiffOnlyToggle,
  PairCompareTable,
  useDiffOnly,
} from "./compare-table.js";
import { escNext, type ExpertDetailController, type DetailState } from "./detail-source.js";

/** textarea 行高刻度（Body 14/22——官方排版令牌行高，autosize 上下界按行数换算）。 */
const TEXTAREA_LINE_PX = 22;

/** 简介 textarea：默认 2 行、最多 6 行自适应（内容上限 120 字不变）。 */
const DESCRIPTION_MIN_PX = TEXTAREA_LINE_PX * 2 + 2;
const DESCRIPTION_MAX_PX = TEXTAREA_LINE_PX * 6 + 2;

/** 人设 textarea：默认 12 行、最多 100 行自适应，滚动上界兜底。 */
const PERSONA_MIN_PX = TEXTAREA_LINE_PX * 12 + 2;
const PERSONA_MAX_PX = TEXTAREA_LINE_PX * 100 + 2;

/** 全目录技能候选面（multi-select 技能下拉 + 面板汇总注入）。 */
export type AllSkills = readonly string[];

/** 自适应 textarea（默认 rows 起步；输入按 scrollHeight 增长至 max 上界，滚动兜底）。 */
function AutoTextarea(props: {
  readonly value: string;
  readonly minPx: number;
  readonly maxPx: number;
  readonly onChange: (value: string) => void;
  readonly ariaLabel: string;
}): ReactNode {
  return (
    <textarea
      className="dswf-dlg-textarea"
      aria-label={props.ariaLabel}
      rows={Math.round((props.minPx - 2) / TEXTAREA_LINE_PX)}
      maxLength={props.maxPx === DESCRIPTION_MAX_PX ? DESCRIPTION_MAX : undefined}
      style={{ minHeight: props.minPx, maxHeight: props.maxPx }}
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
          <Inline parts={block.inline} />
        </li>,
      );
      return;
    }
    flush();
    if (block.kind === "heading") {
      out.push(
        <strong key={index} className="dswf-dlg-md-h">
          <Inline parts={block.inline} />
        </strong>,
      );
    } else {
      out.push(
        <div key={index}>
          <Inline parts={block.inline} />
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
 * multi-select 菜单 placement 纯决策（fixed 视口锚定）：
 * 下方空间足够 → below（top = box 底 + 4）；下方不足且上方更宽裕 → above
 * （bottom = 视口高 - box 顶 + 4）。坐标一律视口系——菜单 position:fixed 挂
 * viewport，不受 Dialog body overflow 裁切。
 */
export function mselMenuPlacement(
  box: { top: number; bottom: number; left: number; width: number },
  viewportHeight: number,
  maxMenuPx = 240,
): {
  side: "below" | "above";
  style: { left: number; width: number; top?: number; bottom?: number };
} {
  const below = viewportHeight - box.bottom;
  const base = { left: box.left, width: box.width };
  if (below < maxMenuPx && box.top > below) {
    return { side: "above", style: { ...base, bottom: viewportHeight - box.top + 4 } };
  }
  return { side: "below", style: { ...base, top: box.bottom + 4 } };
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
    { left: number; width: number; top?: number; bottom?: number } | undefined
  >(undefined);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    // 捕获阶段挂载（attachMselCollapse 注记——冒泡期监听被 Dialog 合成 stopPropagation 截停）
    const offCollapse = attachMselCollapse(document, () => rootRef.current, setOpen);
    // fixed 定位：box 视口矩形 → 菜单坐标；Dialog body 滚动（capture）与窗口 resize 跟随
    const place = (): void => {
      const box = boxRef.current;
      if (box === null) return;
      setMenuStyle(
        mselMenuPlacement(box.getBoundingClientRect(), window.innerHeight).style,
      );
    };
    place();
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      offCollapse();
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
          <div className="dswf-msel-menu" style={menuStyle} data-msel-menu={props.field}>
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

/** 来源置顶徽标条（① 查看/编辑态均呈现：来源 lead + 具名角标 + 生效标 + 被遮蔽同名提示）。 */
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
  return (
    <div className="dswf-dlg-origin-bar" data-dswf-origin-bar="">
      <span className="dswf-dlg-origin-lead">来源</span>
      <span className={`origin-badge origin-${expert.origin}`}>
        {originLabel(expert.origin, projectName)}
      </span>
      <span className="eff-badge">生效</span>
      {masked === undefined ? null : <span className="dswf-dlg-origin-masked">{masked}</span>}
    </div>
  );
}

/** 两两对比态 body（③⑥：对象单选列表——Dialog 形态唯一选择控件，chips 为聚组展开语汇不在此；差异默认表 + 退出回查看）。 */
function CompareBody({
  state,
  shadows,
  projectName,
  controller,
}: {
  readonly state: DetailState;
  readonly shadows: readonly ExpertView[];
  readonly projectName?: string;
  readonly controller: ExpertDetailController;
}): ReactNode {
  const { showAll, toggle } = useDiffOnly();
  // Root cause（bug f4020406 ⑥）：state 只存 compareTargetOrigin，渲染时从同键最新
  // 条目重解析——轮询换新后对比表随 sameKeyEntries 自动换新，不读陈旧快照。
  const target = shadows.find((shadow) => shadow.origin === state.compareTargetOrigin);
  return (
    <>
      <div className="dswf-cmp-pick-list">
        <b>对比</b>（两两）——选择同键其它来源：
        {shadows.map((shadow) => (
          <button
            key={shadow.origin}
            type="button"
            className={`dswf-cmp-opt${target?.origin === shadow.origin ? " sel" : ""}`}
            data-cmp-target={shadow.origin}
            onClick={() => controller.selectCompareTarget(shadow)}
          >
            <span className={`origin-badge origin-${shadow.origin}`}>{originLabel(shadow.origin, projectName)}</span>
            <span>{shadow.title}</span>
            <span className="dswf-cmp-opt-updated">{shadow.updatedAt?.slice(0, 10) ?? "随包分发"}</span>
          </button>
        ))}
      </div>
      <DiffOnlyToggle
        showAll={showAll}
        diffCount={target === undefined ? 0 : diffFields(state.expert, target).length}
        onToggle={toggle}
      />
      {target === undefined ? null : (
        <PairCompareTable
          effective={state.expert}
          shadow={target}
          showAllFields={showAll}
          projectName={projectName}
        />
      )}
    </>
  );
}

/** 详情 Dialog 呈递件（控制器驱动；F2 组件树逐位）。 */
export function ExpertDetailDialog(props: {
  readonly controller: ExpertDetailController;
  readonly allSkills: AllSkills;
  /** multi-select 初始展开态（SSR 测试/调试面；默认收起 = 原型语义）。 */
  readonly mselDefaultOpen?: boolean;
  /** 同键全层条目（1.61 裁决①③：来源置顶条 + 两两对比对象源；缺席 = 旧装配降级无来源条）。 */
  readonly sameKeyEntries?: readonly ExpertView[];
  /** 项目具名（④：workspace 路径 basename——来源角标/提示具名「项目 · <名>」）。 */
  readonly projectName?: string;
}): ReactNode {
  const state = useSyncExternalStore(
    props.controller.subscribe.bind(props.controller),
    props.controller.getSnapshot.bind(props.controller),
    props.controller.getSnapshot.bind(props.controller),
  );
  const editing = state.mode === "edit";
  const comparing = state.mode === "compare";
  const expert = state.expert;
  // 被遮蔽同名卡（对比对象源）：同键条目中非当前呈现的只读层。
  const shadows = (props.sameKeyEntries ?? []).filter(
    (peer) => peer !== expert && peer.effective !== true,
  );

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

  const body = comparing ? (
    <CompareBody
      state={state}
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
        <label>简介（模型选人依据：何时委派我 · 默认 2 行，最多 6 行 ≈ 120 字）</label>
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
      <MultiSelect
        field="tools"
        label="工具白名单（子会话强制生效 · 多选）"
        selected={state.draft.tools}
        candidates={TOOL_CANDIDATES}
        allowAdd={false}
        defaultOpen={props.mselDefaultOpen}
        onToggle={(value) => props.controller.toggleTool(value)}
        onAdd={() => undefined}
      />
      <MultiSelect
        field="skills"
        label="技能标签（多选，可新增）"
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
      <div className="dswf-dlg-meta">
        {expert.title} · {expert.enabled ? "启用中" : "已禁用"}
      </div>
      <div className="dswf-dlg-seg">简介（何时委派我）</div>
      <div className="dswf-dlg-meta">{expert.description}</div>
      <div className="dswf-dlg-seg">人设（Persona · 派发时注入子会话）</div>
      <div className="dswf-dlg-md">
        <PersonaMd source={expert.personaMd} />
      </div>
      <div className="dswf-dlg-seg">工具白名单（子会话强制生效）</div>
      <div className="dswf-dlg-chips">
        {expert.tools.map((tool) => (
          <span key={tool} className="chip tool">
            {tool}
          </span>
        ))}
      </div>
      <div className="dswf-dlg-seg">技能标签</div>
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
        onClick={(event) => event.stopPropagation()}
      >
        {props.sameKeyEntries === undefined ? null : (
          <OriginBar expert={expert} shadows={shadows} projectName={props.projectName} />
        )}
        <div className="dswf-dlg-head">
          <span className={`dot ${expert.enabled ? "on" : "off"}`} />
          <b className="dswf-dlg-name">{expert.name}</b>
          <span className="chip tool">{expert.name}</span>
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
                disabled={state.busy}
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
                    onClick={() => props.controller.startCompare(shadows[0]!)}
                  >
                    对比
                  </button>
                )}
                <button
                  type="button"
                  className="dswf-btn dswf-btn-ghost"
                  onClick={() => props.controller.startEdit()}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="dswf-btn dswf-btn-ghost"
                  data-dswf-toggle-enabled=""
                  disabled={state.busy}
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
