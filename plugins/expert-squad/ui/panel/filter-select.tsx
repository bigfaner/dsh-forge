// panel/filter-select —— 头部筛选单选下拉（native <select> 退役——官方 select 组件不在
// 插件 classic-script 外置表，面板内已批准的 msel 视觉词汇统一承载：box + caret + fixed
// 视口锚定菜单 + 外点收起）。交互纯决策复用 detail-dialog 既有导出（attachMselCollapse /
// mselMenuPlacement / mselMenuStyleEqual——单点正本零复制）。
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  attachMselCollapse,
  mselMenuPlacement,
  mselMenuStyleEqual,
} from "./detail-dialog.js";
import { MSEL_MENU_MAX_PX } from "./detail-logic.js";

/** 菜单未测量首帧兜底样式（隐藏先测量——不落 static 位置跳位；msel 同语义）。 */
const MENU_HIDDEN = { visibility: "hidden" } as const;

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * 单选筛选下拉（受控 value；box 显当前值，菜单选中行高亮，点选即换值收起；
 * 外点收起 + fixed 视口锚定滚动/resize 跟随——msel 同款四项加固）。
 * filtersOpen = SSR 测试/调试初始展开态（缺省收起——msel 语义同径）。
 */
export function FilterSelect(props: {
  readonly id: string;
  readonly ariaLabel: string;
  readonly value: string;
  readonly options: readonly FilterOption[];
  readonly onChange: (value: string) => void;
  readonly filtersOpen?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(props.filtersOpen === true);
  const [menuStyle, setMenuStyle] = useState<
    { left: number; width: number; maxHeight: number; top?: number; bottom?: number } | undefined
  >(undefined);
  const boxRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    return attachMselCollapse(document, () => rootRef.current, setOpen);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = (): void => {
      const box = boxRef.current;
      if (box === null) return;
      const next = mselMenuPlacement(box.getBoundingClientRect(), window.innerHeight, MSEL_MENU_MAX_PX).style;
      setMenuStyle((prev) => (prev !== undefined && mselMenuStyleEqual(prev, next) ? prev : next));
    };
    place();
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  const current = props.options.find((option) => option.value === props.value);
  return (
    <div
      ref={rootRef}
      className={`dswf-select${open ? " dswf-select-open" : ""}`}
      data-select={props.id}
    >
      <button
        type="button"
        ref={boxRef}
        id={props.id}
        className="dswf-select-box"
        aria-label={props.ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <span className="dswf-select-value" data-select-value={props.value}>
          {current?.label ?? props.value}
        </span>
        <span className="dswf-select-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div
          className="dswf-select-menu"
          role="listbox"
          aria-label={props.ariaLabel}
          style={menuStyle ?? MENU_HIDDEN}
          data-select-menu={props.id}
        >
          {props.options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === props.value}
              className={`dswf-select-option${option.value === props.value ? " sel" : ""}`}
              data-select-option={option.value}
              onClick={() => {
                props.onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
