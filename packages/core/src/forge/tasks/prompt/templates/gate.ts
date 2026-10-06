// gate 模板（质量门验证）——老 forge gate.md 平移（mermaid 流程图段省略：与失败步表和
// <constraints> 失败分诊重复，纯冗余不搬；判据形制 MUST=通过判据/MUST NOT=红线保留）。
import {
  AC_VALIDATION,
  GATE_QUALITY_TABLE,
  HARD_RULES_GATE,
  SCAN_5DIM_VALIDATION,
  SPEC_AUTHORITY,
  recordFields,
  step1Read,
  type TypePolicyContext,
} from './shared.js'

export function gate(_ctx: TypePolicyContext): string {
  return `Objective: verify phase gate criteria.

## Workflow (3 Steps)

${step1Read(3, 'The gate task definition carries the acceptance criteria for this phase.')}

${SPEC_AUTHORITY}

${HARD_RULES_GATE}

${SCAN_5DIM_VALIDATION}

### Step 2: Verify All Criteria

Validate each check against Reference Files loaded in Step 1, not just code structure. Record SCAN DIFFERS as validation findings.

${AC_VALIDATION}

First, verify the acceptance criteria from the gate task:

1. Read each acceptance criterion listed in the gate task definition
2. For criteria with explicit verification commands — run them
3. For criteria without commands — verify by reading the relevant source files and confirming the expected behavior exists
4. Record pass/fail for each criterion

**If any criterion fails:**
- If the gap is trivial (e.g., missing import, typo): fix it inline and re-verify (max 2 attempts)
- If the gap is non-trivial or max attempts reached: document it as a finding in your output, then submit result=blocked with reason "gate check gap unresolved"
- Do NOT force the gate to pass — an unmet criterion means the gate fails

${GATE_QUALITY_TABLE}

${recordFields(['gatePassed', 'gateChecks'])}

Output: \`Step 2/3: Verifying criteria... DONE\``
}
