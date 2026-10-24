// panel/summon-source —— 召唤对话状态机（HR 招聘对话，ui-design page-map「召唤对话」
// 行：空（开场指引）· 对话中 · 建档回执）：框架无关控制器（subscribe/getSnapshot 形
// 状与 useSyncExternalStore 对接，list-source 同范式）。发送 = me 消息 + 占位 →
// update 路由 upsert 建档 → 回执替换占位 → onCreated 联动列表刷新；失败占位替换为
// 错误文案（对话不中断）。消息流跨关闭保留（原型语义：重开不再注入开场指引）。

import type { ExpertView } from "./filter.js";
import {
  OPENING_GUIDE,
  deriveRecruit,
  errorText,
  receiptText,
  RECEIPT_REF,
  thinkingText,
} from "./summon-logic.js";
import type { ExpertDraft } from "./detail-logic.js";

/** 对话消息（hr/me 气泡；ref = 引导行；bold = 回执岗位名强片段）。 */
export interface SummonMessage {
  readonly from: "hr" | "me";
  readonly text: string;
  readonly ref?: string;
}

/** 控制器快照。 */
export interface SummonState {
  readonly open: boolean;
  readonly messages: readonly SummonMessage[];
  /** 在途建档（输入行与发送钮防重）。 */
  readonly busy: boolean;
}

/** 建档缝（update 路由 upsert 装配面；测试注入替身）。 */
export type SummonCreator = (key: string, draft: ExpertDraft) => Promise<ExpertView>;

/** 建档成功后的列表联动刷新回调（面板即时重拉，不待 5s 轮询）。 */
export type SummonCreated = () => void;

const IDLE_SNAPSHOT: SummonState = { open: false, messages: [], busy: false };

/**
 * 召唤对话控制器：open/close/send。语义：
 * - 首次 open 注入开场指引；再次 open 不重复（消息跨关闭保留——原型语义）；
 * - send：空文本/busy 在途不重入；me 消息 + 「正在建档…」占位 → 建档 → 回执替换
 *   占位并触发 onCreated 列表联动；失败替换为错误文案。
 */
export class SummonChatController {
  private state: SummonState = IDLE_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly create: SummonCreator,
    private readonly onCreated: SummonCreated,
  ) {}

  getSnapshot(): SummonState {
    // 引用稳定快照（useSyncExternalStore 快照契约——新对象字面量会被判为快照变化）
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 打开对话（幂等；首次注入开场指引）。 */
  open(): void {
    if (this.state.open) return;
    this.state =
      this.state.messages.length === 0
        ? { open: true, busy: false, messages: [{ from: OPENING_GUIDE.from, text: OPENING_GUIDE.text, ref: OPENING_GUIDE.ref }] }
        : { ...this.state, open: true };
    this.emit();
  }

  /** 关闭对话（Esc/遮罩/✕；消息流保留）。 */
  close(): void {
    if (!this.state.open) return;
    this.state = { ...this.state, open: false };
    this.emit();
  }

  /** 发送建档请求（Enter/发送钮入口）。 */
  async send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (trimmed === "" || this.state.busy) return;
    this.state = {
      ...this.state,
      busy: true,
      messages: [
        ...this.state.messages,
        { from: "me", text: trimmed },
        { from: "hr", text: thinkingText() },
      ],
    };
    this.emit();
    const { key, title, draft } = deriveRecruit(trimmed);
    try {
      await this.create(key, draft);
      this.state = {
        ...this.state,
        busy: false,
        messages: replaceLast(
          this.state.messages,
          { from: "hr", text: receiptText(title, key), ref: RECEIPT_REF },
        ),
      };
      this.onCreated();
    } catch (err) {
      this.state = {
        ...this.state,
        busy: false,
        messages: replaceLast(
          this.state.messages,
          { from: "hr", text: errorText(err instanceof Error ? err.message : String(err)) },
        ),
      };
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of Array.from(this.listeners)) listener();
  }
}

/** 末条占位替换（不可变——回执/错误文案替换「正在建档…」）。 */
function replaceLast(
  messages: readonly SummonMessage[],
  replacement: SummonMessage,
): readonly SummonMessage[] {
  const next = messages.slice(0, -1);
  next.push(replacement);
  return next;
}
