// @vitest-environment happy-dom
// factory-bridge 测试（1.30 slots 复用裁决）：官方树内 shell.overlay 入口持
// renderFactorySlot → portal 渲 conversation.content 工厂进替身卡 S2 宿主锚。
// 注册缝（ctx.slots.register）/ 锚生命周期（mount 置锚 / unmount 清锚）/ 缺席降级 /
// occurrence props 形状（embedded/active/非 hero）。
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import {
  FactoryBridgeEntry,
  FactoryChatView,
  installFactoryBridge,
  type FactoryBridgeEntryProps,
  type RenderFactorySlotFace,
} from "../src/client/factory-bridge.js";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

type EntryComponent = (props: FactoryBridgeEntryProps) => unknown;

/** ctx.slots 桩：捕获 register 调用（entry 组件 + disposer 记账）。 */
function ctxWithSlots(): {
  ctx: Context;
  entries: Array<{ name: string; id?: string; component: EntryComponent }>;
  disposeAll(): void;
} {
  const entries: Array<{ name: string; component: EntryComponent }> = [];
  const disposers: Array<() => void> = [];
  const ctx = {
    slots: {
      register: (options: { name: string; id?: string }, component: EntryComponent) => {
        entries.push({ name: options.name, id: options.id, component });
        const dispose = () => {
          const index = entries.findIndex((entry) => entry.component === component);
          if (index >= 0) entries.splice(index, 1);
        };
        disposers.push(dispose);
        return dispose;
      },
    },
  } as unknown as Context;
  return { ctx, entries, disposeAll: () => disposers.forEach((dispose) => dispose()) };
}

/** 替身卡 S2 宿主锚挂载/摘除（真实 React 生命周期——锚经快照店跨 root 同步）。 */
function mountChatView(): {
  container: HTMLElement;
  host(): HTMLElement | null;
  unmount(): void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<FactoryChatView streaming={true} />);
  });
  return {
    container,
    host: () => container.querySelector("[data-dscf-factory-host]"),
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** 桥入口渲染（官方树侧——fake renderFactorySlot 代 renderer 交付面）。 */
function renderEntry(renderFactorySlot: RenderFactorySlotFace | undefined): {
  container: HTMLElement;
  unmount(): void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    const element = <FactoryBridgeEntry renderFactorySlot={renderFactorySlot} />;
    root.render(element);
  });
  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

let chat: ReturnType<typeof mountChatView> | null = null;
let bridge: ReturnType<typeof renderEntry> | null = null;

afterEach(() => {
  bridge?.unmount();
  bridge = null;
  chat?.unmount();
  chat = null;
});

describe("installFactoryBridge（shell.overlay 官方缝注册）", () => {
  it("ctx.slots 在场 = 以 name 'shell.overlay' + list 槽 id 注册入口组件，disposer 幂等摘除", () => {
    const { ctx, entries, disposeAll } = ctxWithSlots();
    const dispose = installFactoryBridge(ctx);
    expect(dispose).toBeTypeOf("function");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("shell.overlay");
    expect((entries[0] as unknown as { id?: string }).id).toBe("super-composer-factory-bridge");
    disposeAll();
    expect(entries).toHaveLength(0);
    expect(() => disposeAll()).not.toThrow();
  });

  it("slots 服务缺席 = undefined（降级不炸组合）；register 抛错 = undefined + console 留痕", () => {
    const fail = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(installFactoryBridge({} as Context)).toBeUndefined();
    const throwing = { slots: { register: () => { throw new Error("occupied"); } } } as unknown as Context;
    expect(installFactoryBridge(throwing)).toBeUndefined();
    expect(fail).toHaveBeenCalled();
    fail.mockRestore();
  });
});

describe("FactoryChatView S2 布局（1.34 融合 + 1.38 内容驱动渐进展开）", () => {
  it("未增高（进入 S2 未发送）：宿主 40vh 初始块 + 高度过渡动效在场", () => {
    chat = mountChatView();
    const host = chat.host()!;
    expect(host.style.height).toBe("40vh");
    expect(host.style.transition).toContain("height");
  });

  it("增高态（无布局环境回落）：宿主高度 = 上限锚减顶缘留白 100px（不顶格，1.40 参数裁决）+ maxHeight 钳制，过渡动效保持", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <FactoryChatView streaming={false} grown={true} grownMaxHeight="calc(100dvh - var(--dsw-space-6, 24px) - 40px)" />,
      );
    });
    const host = container.querySelector<HTMLElement>("[data-dscf-factory-host]")!;
    expect(host.style.height).toBe(
      "calc(calc(100dvh - var(--dsw-space-6, 24px) - 40px) - 100px)",
    );
    expect(host.style.maxHeight).toBe(
      "calc(calc(100dvh - var(--dsw-space-6, 24px) - 40px) - 100px)",
    );
    expect(host.style.transition).toContain("height");
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("内容驱动递进（RO 实测）：高度 = 实测内容高逐块跟随增长，maxHeight = 上限减留白 100px 承担钳制（不顶格）", () => {
    class ROStub {
      static instances: ROStub[] = [];
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
        ROStub.instances.push(this);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      fire(blockSize: number): void {
        this.cb(
          [{ borderBoxSize: [{ blockSize }] }] as unknown as ResizeObserverEntry[],
          this as unknown as ResizeObserver,
        );
      }
    }
    const original = globalThis.ResizeObserver;
    (globalThis as Record<string, unknown>).ResizeObserver = ROStub;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const cap = "calc(calc(100dvh - var(--dsw-space-6, 24px) - 40px) - 100px)";
    act(() => {
      root.render(
        <FactoryChatView streaming={true} grown={true} grownMaxHeight="calc(100dvh - var(--dsw-space-6, 24px) - 40px)" />,
      );
    });
    const host = container.querySelector<HTMLElement>("[data-dscf-factory-host]")!;
    expect(host.style.height).toBe(cap);
    expect(host.style.maxHeight).toBe(cap);
    const stub = ROStub.instances.at(-1)!;
    // 流中内容增长一帧 → 高度跟随（不一步到顶）
    act(() => {
      stub.fire(300);
    });
    expect(host.style.height).toBe("300px");
    act(() => {
      stub.fire(520);
    });
    expect(host.style.height).toBe("520px");
    // 内容超限 → 高度交 max-height 钳到上限（顶缘留白 100px，不顶标题栏分隔线）
    act(() => {
      stub.fire(99999);
    });
    expect(host.style.height).toBe("99999px");
    expect(host.style.maxHeight).toBe(cap);
    act(() => {
      root.unmount();
    });
    container.remove();
    (globalThis as Record<string, unknown>).ResizeObserver = original;
  });

  it("fix-22 数值钳制（maxHeightPx）：内容自然高 ≥ 上限 → 高度一次钳到上限（不渐进）；低于上限随内容增长（渐进语义不回归）", () => {
    class ROStub {
      static instances: ROStub[] = [];
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
        ROStub.instances.push(this);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      fire(blockSize: number): void {
        this.cb(
          [{ borderBoxSize: [{ blockSize }] }] as unknown as ResizeObserverEntry[],
          this as unknown as ResizeObserver,
        );
      }
    }
    const original = globalThis.ResizeObserver;
    (globalThis as Record<string, unknown>).ResizeObserver = ROStub;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <FactoryChatView streaming={false} grown={true} grownMaxHeight="calc(100dvh - 24px - 40px)" maxHeightPx={600} />,
      );
    });
    const host = container.querySelector<HTMLElement>("[data-dscf-factory-host]")!;
    // 内容超限（历史消息多）→ 首测即数值钳到上限（直达，不呈现 99999px 渐进中间值）
    act(() => {
      ROStub.instances.at(-1)!.fire(99999);
    });
    expect(host.style.height).toBe("600px");
    act(() => {
      root.unmount();
    });
    // 内容矮 → 随内容逐块增长（1.40 渐进语义保留）
    const container2 = document.createElement("div");
    document.body.appendChild(container2);
    const root2 = createRoot(container2);
    act(() => {
      root2.render(
        <FactoryChatView streaming={true} grown={true} grownMaxHeight="calc(100dvh - 24px - 40px)" maxHeightPx={600} />,
      );
    });
    const host2 = container2.querySelector<HTMLElement>("[data-dscf-factory-host]")!;
    act(() => {
      ROStub.instances.at(-1)!.fire(300);
    });
    expect(host2.style.height).toBe("300px");
    act(() => {
      ROStub.instances.at(-1)!.fire(520);
    });
    expect(host2.style.height).toBe("520px");
    act(() => {
      root2.unmount();
    });
    container.remove();
    container2.remove();
    (globalThis as Record<string, unknown>).ResizeObserver = original;
  });
});

describe("桥入口 ↔ 替身卡宿主锚（跨 root portal）", () => {
  it("锚在场 = conversation.content 工厂 occurrence 渲进宿主元素（portal 落点 + props 形状）", () => {
    chat = mountChatView();
    const host = chat.host();
    expect(host).not.toBeNull();
    expect(host!.getAttribute("data-streaming")).toBe("true");
    const calls: Array<{ name: string; props: Record<string, unknown> }> = [];
    const probe: RenderFactorySlotFace = (name, props) => {
      calls.push({ name, props });
      return <div data-testid="factory-occurrence">{name}</div>;
    };
    bridge = renderEntry(probe);
    const occurrence = host!.querySelector('[data-testid="factory-occurrence"]');
    expect(occurrence, "工厂 occurrence 未 portal 进替身卡宿主锚").not.toBeNull();
    expect(occurrence!.textContent).toBe("conversation.content");
    expect(calls).toEqual([
      { name: "conversation.content", props: { variant: "embedded", phase: "active", hero: false } },
    ]);
  });

  it("renderFactorySlot 缺席（renderer 未交付）= render(null) 不炸；已交付未锚 = 诊断标记常驻（真机判读面）", () => {
    chat = mountChatView();
    bridge = renderEntry(undefined);
    expect(chat.host()!.querySelector('[data-testid="factory-occurrence"]')).toBeNull();
    expect(document.querySelector("[data-dscf-factory-bridge]")).toBeNull();
    bridge.unmount();
    const probe: RenderFactorySlotFace = (name) => <div data-testid="factory-occurrence">{name}</div>;
    bridge = renderEntry(probe);
    // 锚被上一用例清空前的挂载次序无关——本用例自有 chat 提供锚，标记 + portal 双在场
    expect(document.querySelector("[data-dscf-factory-bridge]")).toBeNull();
    expect(chat.host()!.querySelector('[data-testid="factory-occurrence"]')).not.toBeNull();
  });

  it("锚摘除（替身卡退场/S1 收起）= 桥入口不再渲染工厂（快照店清锚扇出）", () => {
    chat = mountChatView();
    const probe: RenderFactorySlotFace = (name) => <div data-testid="factory-occurrence">{name}</div>;
    bridge = renderEntry(probe);
    expect(chat.host()!.querySelector('[data-testid="factory-occurrence"]')).not.toBeNull();
    chat.unmount();
    chat = null;
    expect(document.querySelector('[data-testid="factory-occurrence"]')).toBeNull();
  });
});
