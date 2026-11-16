// keyed section 鎻掓Ы鎵╁睍鐐?鈥斺€?tab keyed 鍗犵敤鑰呮ā寮忔硾鍖栵紙1.16锛夈€倀ab 闈㈠厛渚?// 锛坰idebar.right.pane.tab keyed 'dswf-bug'鈥斺€擝ugPreview锛夌殑瑁呰浇褰㈡€佹敹鎷负鍗曚竴鐧昏濂戠害锛?// 鐩爣妲藉０鏄庣紳锛堝畼鏂?SlotRegistry.inject鈥斺€斻€屽０鏄庡湪鍦猴紙鎴栧叆搴э級鍗宠銆嶉殢 fiber 鍗歌浇绾ц仈锛?// + keyed 鍗犵敤鑰呰惤搴э紙瀹樻柟 SlotCore.register鈥斺€攌eyed 妲芥寜 key 鍞竴銆佸悓 cell 鍚?priority
// 鍐嶆敞鍐屾姏閿欙級銆傛秷璐归潰锛堟彃浠堕〉鍙岀紳閰嶇疆鑺?ui/settings-section锛変笌鏈墿灞曠偣鍚屽瀷鈥斺€?// 娉涘寲鍚庢柊 keyed/list 鍨嬭妭鍙啓澹版槑琛岋紝涓嶅鍒惰杞芥牱鏉裤€?//
// M2锛坰ettings-unification 鎻愭 settings-unification/proposal.md 鍦嗘瑁佸畾锛夛細
// 鐭ヨ瘑搴撶洰褰曡妭鎺ュ彛鈥斺€攌eyed section 鎻掓Ы鐨勫湪鍦烘€х敱瀹夸富锛坧roject锛夊崟鐐瑰０鏄庯紱knowledge 绛?// 娑堣垂鏂?apply 鏈熺幇鏌?project 鍏峰悕鏈嶅姟锛圥ROJECT_SECTION_HOST_SERVICE锛夊湪鍦烘墠娉ㄥ唽鎻掓Ы
// 锛坵hileServed 闂ㄦ帶 + 瀹夸富鍦ㄥ満鎬у０鏄庯級鈥斺€攑roject 缂哄腑鏃堕浂绛夊緟闆舵偓鎸傦紱妲藉悕/褰㈢姸濂戠害鐢?// 鍙屽寘蹇収娴嬭瘯浜掓锛屼笉闈犺繍琛屾湡瓒呮椂銆傛秷璐归潰锛坒ix-7锛夛細瀹夸富 dock-tabs 姒傝鑺傚涓荤粡
// children 澹版槑缂濆崟鐐瑰０鏄庢Ы锛圤VERVIEW_SECTIONS_CHILDREN锛? ForgeOverviewSectionHost
// renderSlot 娑堣垂 roster鈥斺€旀敞鍐屼晶鍙啓澹版槑琛屻€?// bundle 鑷惈绾緥锛氶浂涓婃父 import锛堢粨鏋勪笌 @deepseek-ai/dsh-client-ui-slots 娑堣垂鍒囩墖鍚屽瀷闀滃儚锛夈€?
/** keyed/list 鍨嬭妭鐧昏濂戠害锛堟硾鍖栬嚜 tab keyed 鍗犵敤鑰呬袱娈垫敞鍐屸€斺€攕lot+kind options 閫愬瓧閫忎紶锛夈€?*/
/**
 * keyed 槽遮蔽 priority（fix-10 bug 400b3952 + fix-12 撞车残余）：同宿主 project 插件
 * 先装、已按同键 priority 0 占用 keyed 槽——同 key 同 priority 注册被官方 slots 拒收
 * （报错明示正缝：「register at a different priority to shadow it (lowest renders)」）。
 * 负 priority 遮蔽占用者（升序分发最低者渲染），单装形态（无占用者）同值落座零行为差异。
 */
export const KEYED_SHADOW_PRIORITY = -10;

export interface KeyedSectionRegistration {
  /** 鐩爣妲藉悕锛堝畼鏂?SlotMap key鈥斺€斿０鏄庣紳涓庤惤搴у悓鍚嶏級銆?*/
  readonly slot: string;
  /** keyed 妲藉崰鐢ㄩ敭锛坘ind: keyed 蹇呭～锛沴ist 鍨嬭妭缂虹渷锛夈€?*/
  readonly key?: string;
  /** list 妲借閿紙kind: list 蹇呭～锛沰eyed 鍨嬭妭缂虹渷锛夈€?*/
  readonly id?: string;
  /** list 妲借搴忋€?*/
  readonly order?: number;
  /** 琛屾樉绀烘爣绛撅紙瀛楃涓叉垨 thunk鈥斺€斿畼鏂?SlotLabel 褰㈢姸锛宼hunk 闅?active locale 閫愯锛夈€?*/
  readonly label?: string | (() => string);
  /** 琛?label 鎵€灞炲懡鍚嶇┖闂达紙鐧昏闈㈠０鏄庯紝瀹樻柟 roster 娑堣垂鈥斺€攍ocale.register 鐨?NS 鍚屾簮锛夈€?*/
  readonly locale?: string;
  /** cell 褰卞瓙/閾惧簭锛堝畼鏂?priority鈥斺€斿崌搴忥紝鍚?cell 鍚屽€兼姏閿欙級銆?*/
  readonly priority?: number;
  /** 鑺?inject face 宸ュ巶锛堢櫥璁伴潰澹版槑鈥斺€旀Ы runtime 涓?ownerProps 骞跺悎閫忎紶缁勪欢锛夈€?*/
  readonly inject?: () => Record<string, unknown>;
  /** 瀛愭Ы澹版槑琛紙瀹樻柟 SlotCore.register children 鍗忚鈥斺€斿０鏄庡嵆鍗犳湁锛屽涓诲崟鐐瑰０鏄庣紳锛夈€?*/
  readonly children?: Record<string, unknown>;
  /** 鑺傜粍浠舵湰浣擄紙瀹樻柟浜斾唤棰濈粍鍚?props 濂戠害鈥斺€旀湰鎵╁睍鐐归浂瑁佸壀閫忎紶锛夈€?*/
  readonly component: unknown;
}

/** 瀹樻柟 slots 鏈嶅姟娑堣垂鍒囩墖锛堢粨鏋勫悓鍨嬮暅鍍忊€斺€攂undle 鑷惈闆朵笂娓?import锛夈€?*/
export interface SectionSlotsFace {
  /** 妲藉０鏄庣紳锛氬０鏄庡湪鍦猴紙鎴栧叆搴э級鍗宠 cb锛沜b 杩斿洖閲婃斁鍣ㄩ殢 fiber 鍗歌浇绾ц仈銆?*/
  inject?(key: string, callback: () => (() => void) | undefined): (() => void) | undefined;
  /** 娉ㄥ唽鍗犵敤鑰咃紙options.name = 妲藉悕锛沰ey/id/order/label/priority = kind 褰㈢姸瀛楁锛夈€?*/
  register?(options: Record<string, unknown>, component: unknown): (() => void) | undefined;
}

/**
 * 鍗曡鐧昏瀹堝崼锛堟敞鍐岄潰寮傚父鍙檷鏈鈥斺€攃onsole.error 鐣欑棔涓嶅婧㈢偢瑁呴厤锛? * expert-squad safeRegister 鍚屾寰鍒垛€斺€斾袱澶勫潎涓烘Ы鐧昏瀹堝崼锛屾娊鍏变韩妯″潡鍙嶅鑰﹀悎锛夈€? */
export function safeRegisterSection(
  slots: SectionSlotsFace,
  options: Record<string, unknown>,
  component: unknown,
): (() => void) | undefined {
  if (typeof slots.register !== "function") return undefined;
  try {
    return slots.register(options, component);
  } catch (error) {
    console.error("[dsh-forge/task-loop] keyed section registration failed鈥斺€旈檷绾т笉娉ㄥ唽", error);
    return undefined;
  }
}

/**
 * 娉ㄥ唽涓€涓?keyed/list 鍨嬭妭锛堜袱娈靛紡锛歴lots.inject(slot) 澹版槑缂?鈫?safeRegisterSection 钀藉骇锛夈€? * slots 鍔ｅ舰锛坕nject/register 缂哄腑锛? fail-soft 涓嶆敞鍐岋紙warn 鐣欑棔锛屼笉鐐哥粍鍚堬級銆? */
export function registerKeyedSection(
  slots: SectionSlotsFace | undefined,
  registration: KeyedSectionRegistration,
): (() => void) | undefined {
  const inject = slots?.inject;
  if (slots === undefined || typeof inject !== "function") {
    console.warn("[dsh-forge/task-loop] ctx.slots.inject absent; keyed section not mounted");
    return undefined;
  }
  const { slot, key, id, order, label, locale, priority, inject: face, children, component } = registration;
  const options: Record<string, unknown> = { name: slot };
  if (key !== undefined) options.key = key;
  if (id !== undefined) options.id = id;
  if (order !== undefined) options.order = order;
  if (label !== undefined) options.label = label;
  if (locale !== undefined) options.locale = locale;
  if (priority !== undefined) options.priority = priority;
  if (face !== undefined) options.inject = face;
  if (children !== undefined) options.children = children;
  // 落座结果如实回传（fix-10 bug 400b3952 修型）：声明缝同步落座（宿主 slot 已在场的
  // 常态）→ 返回 safeRegisterSection 落座结果——注册撞车降级（undefined）可被调用方
  // `=== undefined` 门如实裁决，boot 日志不再假阳性；声明边迟到激活（slot 未声明，
  // cb 异步触发）→ 返回 inject 撤销器（落座成败随激活期如实留痕）。
  let installed: (() => void) | undefined;
  let settled = false;
  const disposer = inject.call(slots, slot, () => {
    installed = safeRegisterSection(slots, options, component);
    settled = true;
    return installed;
  });
  return settled ? installed : disposer;
}

// 鈹€鈹€ M2锛氱煡璇嗗簱鐩綍鑺傦紙濂戠害閿?+ 瀹夸富娑堣垂闈㈤殢 fix-7 钀藉湴锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/** 瀹夸富鍦ㄥ満鎬у０鏄庢湇鍔″悕锛坧roject 鎻掍欢鍏峰悕鏈嶅姟鈥斺€攌nowledge 娑堣垂鏂?apply 鏈熺幇鏌ラ敋锛夈€?*/
export const PROJECT_SECTION_HOST_SERVICE = "project.sections";

/** 鐭ヨ瘑搴撶洰褰曡妭妲藉悕锛圡2 鎸傝浇鐐癸紱妲藉悕濂戠害鐢卞弻鍖呭揩鐓ф祴璇曚簰妫€鈥斺€攕ettings-unification 鍦嗘瑁佸畾锛夈€?*/
export const KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT = "project.section.knowledge-dir";

/**
 * 瀹夸富 section 鏈嶅姟褰㈢姸锛圡2 娑堣垂鍒囩墖棰勭暀锛夛細knowledge 鐜版煡 ctx[PROJECT_SECTION_HOST_SERVICE]
 * 鍦ㄥ満鍚庯紝缁?whileServed 闂ㄦ帶娉ㄥ唽 keyed 鐩綍鑺傦紙瀹夸富缂哄腑 = 闆剁瓑寰呴浂鎮寕鈥斺€擜GENTS 1.6
 * 鍦ㄥ満鎬ф娴嬫案涓嶇紦瀛樸€佹秷璐圭偣鐜版煡锛夈€? */
export interface ProjectSectionHostFace {
  /** 瀹夸富鍗曠偣澹版槑鐨?keyed section 妲藉悕锛堢幇鍊?= KEYED_SECTION_M2_KNOWLEDGE_DIR_SLOT锛夈€?*/
  readonly slot: string;
  /** 鍦ㄥ満闂ㄦ帶锛堝畼鏂?configForms.whileServed 鍚屽瀷鈥斺€攏amespace 鏈鏈嶅姟鍗虫媶鍗革級銆?*/
  whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void): () => void;
}
