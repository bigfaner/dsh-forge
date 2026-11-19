// CT-NPM-03 零缺席判据（bug 47af0d8c · fix-8 收窄）——区分「合法 pending」与「真缺席」。
//
// 背景：原锚 `stderr.includes('@dsh-forge')` 过宽，命中宿主激活诊断
// 「N entries did not activate … (@dsh-forge/x): pending (waiting for service …)」——
// headless dsh-base CLI 背板无 webServer/connection/workspaceRegistry 等服务，
// 四件合法 pending 是「装载本体存活、等宿主服务」，非缺席。
//
// 判据（契约 CT-NPM-03 锚收窄，第 5 周期实锚样本自证）：
// - 合法 pending（非缺席）：entry 行形态 `<name> (@dsh-forge/<pkg>): pending (waiting for service…)`
//   ——背板服务缺席的正常非缺席证据，不判 FAIL；
// - 真缺席（判 FAIL）：did not activate 块内非 pending 的 @dsh-forge entry 行
//   （import 失败/解析失败/装载失败），以及任意 failed to import / 模块解析失败线索行。
//
// 锚定纪律（fix-4/fix-6/fix-7 同族）：锚稳定行为（五件解析装载 + 版本双校验），
// 不锁宿主背板形态（headless/web 背板差异、pending 服务清单随宿主 profile 变化不触发断言翻转）。

/** 合法 pending entry 行（等待宿主服务——装载本体存活，非缺席） */
const PENDING_ENTRY_RE = /^.*\(@dsh-forge\/[\w.-]+\): pending \(waiting for services?[:.][^)]*\)\s*$/u

/** 激活缺席块头（官方宿主 stderr 直落形态：`dsh: warning: N entries did not activate`） */
const ACTIVATE_HEADER_RE = /^\s*dsh: warning: \d+ entr(?:y|ies) did not activate\s*$/u

/** 真缺席线索行（模块解析/导入失败——与 did not activate 块无关也独立判缺席） */
const FAILURE_CLUE_RE = /failed to import|Cannot find module|ERR_MODULE_NOT_FOUND|ERR_MODULE_RESOLVE/u

/**
 * 从宿主 stderr 提取真缺席线索行（空数组 = 零缺席装配）。
 * did not activate 块内仅 pending entry 行 → 合法等待，不计缺席；
 * 块内出现非 pending 的行（或块外命中失败线索正则）→ 真缺席。
 */
export function forgeBundleAbsenceClues(stderr: string): readonly string[] {
  const clues: string[] = []
  let inBlock = false
  for (const raw of stderr.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (ACTIVATE_HEADER_RE.test(line)) {
      inBlock = true
      continue
    }
    if (inBlock) {
      if (line.trim() === '') {
        inBlock = false
      } else if (/@dsh-forge\//u.test(line)) {
        // 块内 @dsh-forge entry 行：pending = 合法等待；其余 = 真缺席
        if (!PENDING_ENTRY_RE.test(line)) clues.push(line)
        continue
      } else {
        inBlock = false
      }
    }
    if (FAILURE_CLUE_RE.test(line)) clues.push(line)
  }
  return clues
}
