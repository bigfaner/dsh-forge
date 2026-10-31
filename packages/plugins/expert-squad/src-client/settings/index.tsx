// settings —— 配置 tab「默认 Agent 选项」（settings.plugins.tab render slot 注册面）。
// 核销：dsh-client-ui-settings-plugins PluginsSettingsSection.d.ts（section 只拥有导航
// 与 tab chrome，页面内容 = feature-owned tab；官方 plugin-inventory client.js 同径先例
// ——slots.inject(slot, () => slots.register({name, id, order, label, inject}, Component))）。
// 读写正门 = 官方 configForms 服务（dsh-client-ui-settings ConfigForms/ConfigForm 镜像面，
// super-composer submission-settings 同判例：结构同型承载、不做跨包值 import）——
// describe/revision/stale 拒写/schema 校验归官方，写落活动 profile 的 cordis.patch.yml
// （id 定向条目），volatile 通知 → 快照换代 → 面板热刷新（无重启生效）。
// 降级：configForms 缺席（宿主未组 settings 域）= 不注册本 tab（console.warn 留痕）；
// namespace 未被服务 = whileServed 在场门不注册；快照 unavailable = 面板降级提示。
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { FilterSelect } from "../panel/filter-select.js";
import { ensurePanelStyles } from "../panel/styles.js";
import {
  EMPTY_DRAFT,
  REASONING_OPTIONS,
  defaultOptionsDraftOf,
  defaultOptionsPatchOf,
  draftFoldOnRevision,
  type DefaultOptionsDraft,
} from "./default-options-logic.js";

export {
  EMPTY_DRAFT,
  REASONING_OPTIONS,
  defaultOptionsDraftOf,
  defaultOptionsPatchOf,
  defaultOptionsDraftEquals,
  draftFoldOnRevision,
  type DefaultOptionsDraft,
} from "./default-options-logic.js";

/** 官方 Plugins settings section 的 feature-owned tab 槽键（PluginsSettingsSection 契约）。 */
export const PLUGINS_TAB_SLOT = "settings.plugins.tab";
/** 本插件 tab 登记键（槽内唯一即可）。 */
export const SETTINGS_TAB_ID = "default-agent-options";
/** tab 排位（官方 inventory「Plugin list」order 10 之后留序；孤贡献时渲染为页面本身）。 */
export const SETTINGS_TAB_ORDER = 20;
/** tab 名（D5 微文案定稿：DefaultAgentOptions 直译）。 */
export const SETTINGS_TAB_LABEL = "默认 Agent 选项";
/** 本插件 settings namespace 短名（候选一——行 id 恰为短名的部署直配）。 */
export const SETTINGS_NAMESPACE = "expert-squad";
/**
 * namespace 候选集（bug 9577a867）：官方 Host settings describe 的 ns = profile 行 id
 * （dsh-settings describe `ns: entry.options.id`），产品模板生成行 id = `dsh-forge-expert-squad`
 *（apps/host/src/profile/template.ts）而 dev profile 手写行 id = `expert-squad`——候选双
 * 覆盖，实际 namespace 在注册时点从 served 集解析（读写同源）。
 */
const NAMESPACE_CANDIDATES: readonly string[] = [SETTINGS_NAMESPACE, `dsh-forge-${SETTINGS_NAMESPACE}`];
/** 配置字段（cordis Config volatile 字段一）。 */
const FIELD = "defaultAgentOptions";

/** 官方 ConfigForm 消费切片（dsh-client-ui-settings config-form-types 结构同型镜像——
 *  只承载本面板用到的面：快照/订阅/定向字段写。revisioned 写径官方承担）。 */
export interface ConfigFormMirror {
  getSnapshot(): {
    status: "loading" | "ready" | "unavailable";
    value: unknown;
    revision: number | undefined;
    writable: boolean;
  };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<boolean>;
  unset(field: string): Promise<boolean>;
}

/** 官方 configForms 服务消费切片（get(name) → ConfigForm 镜像；whileServed 在场门可选）。 */
interface ConfigFormsFace {
  get(entryId: string): ConfigFormMirror | undefined;
  whileServed?(
    namespaces: readonly string[],
    register: (served: ReadonlySet<string>) => () => void,
  ): () => void;
}

/** unknown → 对象窄化（缺席/非对象 = undefined）。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/** configForms 官方面取法（inject 正门——ctx.configForms；apply 前由 cordis 注入边保证
 * 实例化。bug 9577a867：reflect.get 在 apply 期取到的是未实例化的缺席——官方 settings-*
 * 族全数声明 inject: ["configForms"] 后用类型化 ctx.configForms 消费，同缝收口）。 */
function configFormsFaceOf(ctx: { configForms?: unknown }): ConfigFormsFace | undefined {
  const face = asRecord(ctx.configForms);
  if (face === undefined || typeof face.get !== "function") return undefined;
  return face as unknown as ConfigFormsFace;
}

/**
 * 单行登记（注册面异常只降本行——console 留痕不外溢；index.ts safeRegister 同款微复制
 * ——两处均为「槽登记守卫」，抽共享模块反增耦合，保持就地可读）。
 */
function safeRegister(
  slots: {
    register?(options: Record<string, unknown>, component: unknown): (() => void) | undefined;
  },
  options: Record<string, unknown>,
  component: unknown,
): (() => void) | undefined {
  try {
    return slots.register?.(options, component);
  } catch (error) {
    console.error("[dsh-forge/expert-squad] settings tab registration failed——降级不注册", error);
    return undefined;
  }
}

/**
 * 注册「默认 Agent 选项」tab（settings.plugins.tab render slot；返回联合释放器）。
 * configForms 缺席 = 降级不注册（宿主未组 settings 域——配置写径不存在，UI 不悬空）；
 * whileServed 在场 = 经官方在场门（namespace 未被服务即拆卸），否则直注册。
 */
export function registerDefaultOptionsTab(
  ctx: {
    configForms?: unknown;
    effect?(factory: () => (() => void) | undefined, name?: string): (() => void) | undefined;
  },
  slots: {
    inject?(key: string, callback: () => (() => void) | undefined): (() => void) | undefined;
    register?(options: Record<string, unknown>, component: unknown): (() => void) | undefined;
  },
): (() => void) | undefined {
  const forms = configFormsFaceOf(ctx);
  const inject = slots.inject;
  if (forms === undefined || typeof inject !== "function") {
    console.warn("[dsh-forge/expert-squad] ctx.configForms/slots absent; settings tab not mounted");
    return undefined;
  }
  // 实际 namespace（注册时点从 served 集解析——候选命中序即优先序；读写同源单点）
  let namespace: string = SETTINGS_NAMESPACE;
  // bug 9577a867 伴生面：slots 面是 cordis 代理原型方法（this.ctx 绑调用接收者）——
  // 禁解构裸调，必须 slots.inject(...) 方法调用（解构 = this.ctx undefined 实测崩溃）。
  const mount = (): (() => void) | undefined =>
    slots.inject!(PLUGINS_TAB_SLOT, () =>
      safeRegister(
        slots,
        {
          name: PLUGINS_TAB_SLOT,
          id: SETTINGS_TAB_ID,
          order: SETTINGS_TAB_ORDER,
          label: SETTINGS_TAB_LABEL,
          inject: () => ({ form: forms.get(namespace) }),
        },
        DefaultAgentOptionsTab,
      ),
    );
  if (typeof forms.whileServed === "function") {
    // 官方 settings-* 族同型：whileServed 经 ctx.effect 挂调用者 fiber（卸载级联）。
    const watch = (): (() => void) | undefined => {
      const disposer = forms.whileServed!(NAMESPACE_CANDIDATES, (served) => {
        namespace = NAMESPACE_CANDIDATES.find((candidate) => served.has(candidate)) ?? SETTINGS_NAMESPACE;
        const registered = mount();
        return () => registered?.();
      });
      return () => disposer();
    };
    return typeof ctx.effect === "function" ? ctx.effect(watch, "expert-squad: settings tab watch") : watch();
  }
  return mount();
}

/**
 * 「默认 Agent 选项」面板（原型 A 区 · DESIGN.md 令牌）：单面板无 tab 导航、无警示块；
 * 默认路由三分区行 4:4:1（Provider/Model/Reasoning）；未配置 = 占位即空态；reasoning
 * 四选下拉（FilterSelect 复用——面板 msel 视觉词汇单点）。快照换代即热刷新。
 */
export function DefaultAgentOptionsTab(props: { readonly form?: ConfigFormMirror }): ReactNode {
  ensurePanelStyles();
  const form = props.form;
  const getSnapshot = useRef(form?.getSnapshot.bind(form)).current;
  const subscribe = useRef(
    form === undefined
      ? undefined
      : (listener: () => void) => form.subscribe(listener),
  ).current;
  const snapshot = useSyncExternalStore(
    subscribe ?? (() => () => undefined),
    getSnapshot ?? (() => undefined),
    getSnapshot,
  );

  const [draft, setDraft] = useState<DefaultOptionsDraft>(() =>
    snapshot === undefined ? EMPTY_DRAFT : defaultOptionsDraftOf(snapshot.value),
  );
  // 在输脏标（ref 镜像——事件闭包与 render 期收敛裁决共读单源）
  const dirtyRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // 快照换代（volatile 通知 / 写后折返）→ 草稿收敛（draftFoldOnRevision 裁决——
  // 自身旧写折叠回读不清在输值，React render 期调整态认可式样）
  const [syncedRevision, setSyncedRevision] = useState(snapshot?.revision);
  if (snapshot !== undefined && syncedRevision !== snapshot.revision) {
    setSyncedRevision(snapshot.revision);
    const folded = draftFoldOnRevision(draft, defaultOptionsDraftOf(snapshot.value), dirtyRef.current);
    setDraft(folded.draft);
    dirtyRef.current = folded.dirty;
  }

  const edit = (next: DefaultOptionsDraft): void => {
    dirtyRef.current = true;
    setDraft(next);
  };

  if (form === undefined || snapshot === undefined) return null;
  if (snapshot.status !== "ready") {
    // loading / unavailable（namespace 未被服务 / memory 模式）——降级一行提示，不悬空警示块
    return (
      <div className="dswf-cfg-card" data-cfg-state={snapshot.status}>
        <p className="dswf-cfg-hint">
          {snapshot.status === "loading" ? "正在读取配置…" : "配置服务不可用——当前部署不支持在页面编辑插件配置。"}
        </p>
      </div>
    );
  }

  // 写径（bug 9577a867 伴生面）：blur 即时提交整组草稿（写 commit 传入的 next 本体——
  // draftRef 经 setState 异步更新，读它会滞后一次提交）+ 拒绝重试（官方 set 返回 false
  // = Host 拒绝且已做一次 recover 读——延迟重试携 fresh revision 再写最新草稿）。
  const writeDraft = (patch: Record<string, string> | undefined, left: number): void => {
    const write = patch === undefined ? form.unset(FIELD) : form.set(FIELD, patch);
    write
      .then((accepted) => {
        if (accepted) return;
        if (left <= 0) {
          console.warn("[dsh-forge/expert-squad] defaultAgentOptions write not accepted——放弃本轮（等待下一次编辑重写）");
          return;
        }
        setTimeout(() => writeDraft(defaultOptionsPatchOf(draftRef.current), left - 1), 1500);
      })
      .catch((error: unknown) => {
        console.error("[dsh-forge/expert-squad] defaultAgentOptions write rejected——等待下一次修订", error);
      });
  };
  const commit = (next: DefaultOptionsDraft): void => {
    edit(next);
    writeDraft(defaultOptionsPatchOf(next), 2);
  };

  const reasoningOptions: readonly { value: string; label: string }[] = REASONING_OPTIONS;

  return (
    <div className="dswf-cfg-card" data-cfg-state="ready">
      <h2 className="dswf-cfg-panel-title">默认 Agent 选项</h2>
      <div className="dswf-cfg-seg">默认路由</div>
      <div className="dswf-cfg-row">
        <div className="dswf-cfg-field dswf-cfg-f4" data-cfg-field="provider">
          <label htmlFor="dswf-cfg-provider">Provider</label>
          <input
            id="dswf-cfg-provider"
            className="dswf-dlg-input"
            type="text"
            value={draft.provider}
            placeholder="继承父Agent"
            onChange={(event) => edit({ ...draft, provider: event.target.value })}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit(draft);
            }}
          />
        </div>
        <div className="dswf-cfg-field dswf-cfg-f4" data-cfg-field="model">
          <label htmlFor="dswf-cfg-model">Model</label>
          <input
            id="dswf-cfg-model"
            className="dswf-dlg-input"
            type="text"
            value={draft.model}
            placeholder="继承父Agent"
            onChange={(event) => edit({ ...draft, model: event.target.value })}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit(draft);
            }}
          />
        </div>
        <div className="dswf-cfg-field dswf-cfg-f1" data-cfg-field="reasoning">
          <label htmlFor="dswf-cfg-reasoning">Reasoning</label>
          <FilterSelect
            id="dswf-cfg-reasoning"
            ariaLabel="Reasoning 档位"
            value={draft.reasoning}
            options={reasoningOptions}
            onChange={(value) => commit({ ...draft, reasoning: value })}
          />
        </div>
      </div>
      <div className="dswf-cfg-hint">
        默认路由对所有未覆写路由的专家生效；Reasoning「默认」= 不下发 effort，落模型缺省档
      </div>
    </div>
  );
}
