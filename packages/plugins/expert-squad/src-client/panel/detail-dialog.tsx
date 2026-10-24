// panel/detail-dialog —— 详情 Dialog（ui-design F2 查看/编辑双模式产品实现）：
// 头部（状态灯 + 名称 + 英文标识 chip + 编辑/保存 + ✕）、查看态分段（岗位·启停 meta
// → 简介 → 人设 Markdown 渲染 → 工具白名单 chips → 技能 chips）、编辑态字段集（岗位
// Input / 简介 textarea 1→3 行 120 字上限 / 人设 textarea 6→50 行自适应 / multi-select
// ×2——工具上技能下、技能可新增）、底部禁用/启用钮。Esc / 遮罩 / ✕ 关闭。
// 官方 MarkdownDoc 组件不在插件 client bundle 外置表内（classic script 缝仅 react
// 外置），按原型近似语义以 .dswf-* 自绘面分块渲染（标题/加粗/行内代码/列表）。

import { useEffect, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import {
  DESCRIPTION_MAX,
  personaBlocks,
  TOOL_CANDIDATES,
  type MdInline,
} from "./detail-logic.js";
import type { ExpertDetailController, DetailState } from "./detail-source.js";

/** textarea 行高刻度（Body 14/22——官方排版令牌行高，autosize 上下界按行数换算）。 */
const TEXTAREA_LINE_PX = 22;

/** 简介 textarea：默认 1 行、最多 3 行自适应。 */
const DESCRIPTION_MIN_PX = TEXTAREA_LINE_PX + 2;
const DESCRIPTION_MAX_PX = TEXTAREA_LINE_PX * 3 + 2;

/** 人设 textarea：默认 6 行、最多 50 行自适应，滚动上界兜底。 */
const PERSONA_MIN_PX = TEXTAREA_LINE_PX * 6 + 2;
const PERSONA_MAX_PX = TEXTAREA_LINE_PX * 50 + 2;

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

/** multi-select：box 显已选 chips + 下拉勾选菜单（allowAdd 技能可新增）。 */
function MultiSelect(props: {
  readonly field: "tools" | "skills";
  readonly label: string;
  readonly selected: readonly string[];
  readonly candidates: readonly string[];
  readonly allowAdd: boolean;
  readonly onToggle: (value: string) => void;
  readonly onAdd: (value: string) => void;
}): ReactNode {
  const options = [...new Set([...props.candidates, ...props.selected])];
  return (
    <div className="dswf-dlg-field">
      <label>{props.label}</label>
      <div className="dswf-msel" data-msel={props.field}>
        <div className="dswf-msel-box">
          {props.selected.map((value) => (
            <span key={value} className="chip" data-msel-chip={value}>
              {value}
            </span>
          ))}
          <span className="dswf-msel-placeholder">
            {props.selected.length === 0 ? "点击选择" : ""}
          </span>
        </div>
        <div className="dswf-msel-menu" data-msel-menu={props.field}>
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
      </div>
    </div>
  );
}

/** 详情 Dialog 呈递件（控制器驱动；F2 组件树逐位）。 */
export function ExpertDetailDialog(props: {
  readonly controller: ExpertDetailController;
  readonly allSkills: AllSkills;
}): ReactNode {
  const state = useSyncExternalStore(
    props.controller.subscribe.bind(props.controller),
    props.controller.getSnapshot.bind(props.controller),
    props.controller.getSnapshot.bind(props.controller),
  );
  const editing = state.mode === "edit";
  const expert = state.expert;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") props.controller.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.controller]);

  const body = editing ? (
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
        <label>简介（模型选人依据：何时委派我 · 默认 1 行，最多 3 行 ≈ 120 字）</label>
        <AutoTextarea
          value={state.draft.description}
          minPx={DESCRIPTION_MIN_PX}
          maxPx={DESCRIPTION_MAX_PX}
          ariaLabel="简介"
          onChange={(value) => props.controller.setField("description", value)}
        />
      </div>
      <div className="dswf-dlg-field" data-field="personaMd">
        <label>人设（Markdown 自由输入 · 派发时作为 persona 注入子会话 · 默认 6 行，最多 50 行）</label>
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
        onToggle={(value) => props.controller.toggleTool(value)}
        onAdd={() => undefined}
      />
      <MultiSelect
        field="skills"
        label="技能标签（多选，可新增）"
        selected={state.draft.skills}
        candidates={props.allSkills}
        allowAdd={true}
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
        className="dswf-dlg"
        role="dialog"
        aria-label={`专家详情 ${expert.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dswf-dlg-head">
          <span className={`dot ${expert.enabled ? "on" : "off"}`} />
          <b className="dswf-dlg-name">{expert.name}</b>
          <span className="chip tool">{expert.name}</span>
          <span className="dswf-dlg-head-actions">
            {editing ? (
              <button
                type="button"
                className="dswf-btn dswf-btn-primary"
                disabled={state.busy}
                onClick={() => void props.controller.save()}
              >
                保存
              </button>
            ) : (
              <button
                type="button"
                className="dswf-btn dswf-btn-ghost"
                onClick={() => props.controller.startEdit()}
              >
                编辑
              </button>
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
        <div className="dswf-dlg-foot">
          <button
            type="button"
            className="dswf-btn dswf-btn-ghost"
            disabled={state.busy}
            onClick={() => void props.controller.toggleEnabled()}
          >
            {expert.enabled ? "禁用" : "启用"}
          </button>
        </div>
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
