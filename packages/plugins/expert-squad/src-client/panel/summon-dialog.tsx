// panel/summon-dialog —— 召唤 Modal（HR 招聘对话，已批原型 hrchat 逐位产品实现）：
// 遮罩 + 对话浮面（宽 520、radius 16、lv3）、头部（「HR · 专家招聘与管理」+ ✕）、
// 消息流（hr 左对齐浅底 / me 右对齐强调底气泡 + ref 引导行，自动滚底）、输入行
// （placeholder + Enter 发送 + 发送钮）。Esc / 遮罩 / ✕ 关闭（互斥由装配壳承担）。

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import type { SummonChatController, SummonMessage } from "./summon-source.js";

/** 消息气泡（原型 msg hr/me + .ref 引导行逐位）。 */
function Bubble({ message }: { readonly message: SummonMessage }): ReactNode {
  return (
    <div className={message.from === "hr" ? "msg hr" : "msg me"}>
      {message.text}
      {message.ref === undefined ? null : <div className="dswf-msg-ref">{message.ref}</div>}
    </div>
  );
}

/** 召唤对话 Modal 呈递件（控制器驱动；page-map 召唤对话行三态）。 */
export function SummonDialog(props: {
  readonly controller: SummonChatController;
}): ReactNode {
  const state = useSyncExternalStore(
    props.controller.subscribe.bind(props.controller),
    props.controller.getSnapshot.bind(props.controller),
    props.controller.getSnapshot.bind(props.controller),
  );
  const msgsRef = useRef<HTMLDivElement | null>(null);

  // Esc 关闭 + 消息流自动滚底（原型 scrollTop = 1e9 语义）
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") props.controller.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.controller]);
  useEffect(() => {
    if (msgsRef.current !== null) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [state.messages]);

  const [draft, setDraft] = useState("");

  const submit = (): void => {
    const text = draft.trim();
    if (text === "") return;
    setDraft("");
    void props.controller.send(text);
  };

  return (
    <div
      className="dswf-dlg-overlay dswf-hr-overlay"
      data-dswf-summon-dialog=""
      onClick={() => props.controller.close()}
    >
      <div
        className="dswf-hrchat"
        role="dialog"
        aria-label="HR · 专家招聘与管理"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <b>HR · 专家招聘与管理</b>
          <button
            type="button"
            className="dswf-btn dswf-btn-ghost"
            aria-label="关闭"
            onClick={() => props.controller.close()}
          >
            ✕
          </button>
        </header>
        <div className="dswf-hr-msgs" ref={msgsRef}>
          {state.messages.map((message, index) => (
            <Bubble key={index} message={message} />
          ))}
        </div>
        <div className="dswf-hr-input">
          <input
            type="text"
            placeholder="对 HR 说：招募一个 XX 专家，工具只留…（Enter 发送）"
            aria-label="对 HR 说的招聘需求"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          <button
            type="button"
            className="dswf-btn dswf-btn-primary"
            disabled={state.busy}
            onClick={() => submit()}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
