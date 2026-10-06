// test 系模板 ×4（test-run/test-gen-contracts/test-gen-journeys/test-gen-scripts）——
// 老 forge 同名模板平移（技能驱动 2 步形制；gen/eval 技能面 = M3，M2 词汇+模板保留先置）。
import { recordFields, skillInvocation, step1ReadSimple, type TypePolicyContext } from './shared.js'

const TEST_RECORD_FIELDS = ['scriptsCreated', 'casesGenerated'] as const

export function testRun(_ctx: TypePolicyContext): string {
  return `Objective: run e2e tests via the run-tests skill.

## Hard constraints

- MUST invoke \`Skill(skill="forge:run-tests")\` to execute tests
- MUST NOT run any direct test runner command — the skill handles framework-specific execution
- The skill handles surface resolution, server lifecycle, result parsing, and reporting
- MUST confirm a defect is in production code before modifying production code — test script bugs may be fixed, but MUST NOT alter test assertions or logic to make tests pass
- When multiple issues are found, MUST report them via submit result=blocked (fix 链承接) rather than fixing all issues within the current task

## Workflow (2 Steps)

${step1ReadSimple('what tests to run')}

### Step 2: Run E2E Tests

${skillInvocation('Skill(skill="forge:run-tests")')}

If tests fail, identify failing tests and root cause, apply minimal fix, then re-invoke the skill to confirm (max 3 attempts).

${recordFields(TEST_RECORD_FIELDS)}

Output: \`Step 2/2: Running e2e tests... DONE\``
}

export function testGenContracts(_ctx: TypePolicyContext): string {
  return `Objective: generate test contracts via the gen-contracts skill.

## Hard constraints

- MUST invoke \`Skill(skill="forge:gen-contracts")\` to generate contracts
- MUST NOT write contract files manually — the skill generates them from journeys

## Workflow (2 Steps)

${step1ReadSimple('what contracts to generate')}

### Step 2: Generate Contracts

${skillInvocation('Skill(skill="forge:gen-contracts")')}

${recordFields(TEST_RECORD_FIELDS)}

Output: \`Step 2/2: Generating contracts... DONE\``
}

export function testGenJourneys(_ctx: TypePolicyContext): string {
  return `Objective: generate test journeys via the gen-journeys skill.

## Hard constraints

- MUST invoke \`Skill(skill="forge:gen-journeys")\` to generate journeys
- MUST NOT write journey files manually — the skill generates them from specs

## Workflow (2 Steps)

${step1ReadSimple('what journeys to generate')}

### Step 2: Generate Journeys

${skillInvocation('Skill(skill="forge:gen-journeys")')}

${recordFields(TEST_RECORD_FIELDS)}

Output: \`Step 2/2: Generating journeys... DONE\``
}

export function testGenScripts(_ctx: TypePolicyContext): string {
  return `Objective: generate executable test scripts via the gen-test-scripts skill.

## Hard constraints

- MUST invoke \`Skill(skill="forge:gen-test-scripts")\` to generate scripts
- MUST NOT write test scripts manually — the skill generates them from test cases

## Workflow (2 Steps)

${step1ReadSimple('what test scripts to generate')}

### Step 2: Generate Test Scripts

${skillInvocation('Skill(skill="forge:gen-test-scripts")')}

${recordFields(TEST_RECORD_FIELDS)}

Output: \`Step 2/2: Generating test scripts... DONE\``
}
