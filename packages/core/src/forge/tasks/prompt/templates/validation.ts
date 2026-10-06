// validation 系模板 ×2（validation-code/validation-ux）——老 forge 同名模板平移
// （gate 判据形制：MUST=通过判据/MUST NOT=红线；code 面含完整质量门，ux 面无门）。
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

const VALIDATION_RECORD_FIELDS = ['validationPassed', 'issuesFound'] as const

export function validationCode(_ctx: TypePolicyContext): string {
  return `Objective: validate code quality against acceptance criteria.

## Workflow (3 Steps)

${step1Read(3)}

${SPEC_AUTHORITY}

${HARD_RULES_GATE}

${SCAN_5DIM_VALIDATION}

### Step 2: Validate Code Quality

Validate each check against Reference Files loaded in Step 1, not just code structure. Record SCAN DIFFERS as validation findings.

${AC_VALIDATION}

Perform code validation checks:

1. Read each validation criterion listed in the task definition
2. For criteria with explicit verification commands — run them
3. For criteria without commands — verify by reading the relevant source files
4. Record pass/fail for each criterion

**If any criterion fails:**
- If the gap is trivial (e.g., missing import, typo): fix it inline and re-verify (max 2 attempts)
- If the gap is non-trivial or max attempts reached: document it as a finding, then submit result=blocked with reason "validation gap unresolved"
- Do NOT force validation to pass — an unmet criterion means validation fails

${GATE_QUALITY_TABLE}

${recordFields(VALIDATION_RECORD_FIELDS)}

Output: \`Step 2/3: Validating code... DONE\``
}

export function validationUx(_ctx: TypePolicyContext): string {
  return `Objective: validate UX quality against acceptance criteria.

## Workflow (3 Steps)

${step1Read(3)}

${SPEC_AUTHORITY}

${HARD_RULES_GATE}

${SCAN_5DIM_VALIDATION}

### Step 2: Validate UX Quality

Validate each check against Reference Files loaded in Step 1, not just code structure. Record SCAN DIFFERS as validation findings.

${AC_VALIDATION}

Perform UX validation checks:

1. Read each validation criterion listed in the task definition
2. Verify that the user-facing behavior matches the expected experience
3. Check for accessibility (labels, keyboard navigation), usability (error messages, feedback), and consistency (terminology, layout) issues
4. Record pass/fail for each criterion

**If any criterion fails:**
- If the gap is trivial (e.g., missing label, wrong spacing): fix it inline and re-verify (max 2 attempts)
- If the gap is non-trivial or max attempts reached: document it as a finding, then submit result=blocked with reason "UX validation gap unresolved"
- Do NOT force validation to pass — an unmet criterion means validation fails

${recordFields(VALIDATION_RECORD_FIELDS)}

Output: \`Step 2/3: Validating UX... DONE\``
}
