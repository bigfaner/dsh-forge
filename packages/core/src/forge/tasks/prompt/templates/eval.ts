// eval 系模板 ×2（eval-contract/eval-journey）——老 forge 同名模板平移。词汇+模板 M2
// 保留（tech-design §Interface 9：执行技能 = M3）——技能引用先置，M3 技能面接管后生效。
import { recordFields, skillInvocation, step1ReadSimple, type TypePolicyContext } from './shared.js'

const EVAL_RECORD_FIELDS = ['score', 'findings', 'severity', 'passed'] as const

export function evalContract(_ctx: TypePolicyContext): string {
  return `Objective: evaluate Contract quality via the eval skill.

## Hard constraints

- MUST invoke \`Skill(skill="forge:eval", args="--type contract --target 850")\` to evaluate quality
- MUST NOT modify the files being evaluated

## Workflow (2 Steps)

${step1ReadSimple('what to evaluate')}

### Step 2: Run Evaluation

${skillInvocation('Skill(skill="forge:eval", args="--type contract --target 850")')}

${recordFields(EVAL_RECORD_FIELDS)}

Output: \`Step 2/2: Running evaluation... DONE\``
}

export function evalJourney(_ctx: TypePolicyContext): string {
  return `Objective: evaluate Journey quality via the eval skill.

## Hard constraints

- MUST invoke \`Skill(skill="forge:eval", args="--type journey --target 850")\` to evaluate quality
- MUST NOT modify the files being evaluated

## Workflow (2 Steps)

${step1ReadSimple('what to evaluate')}

### Step 2: Run Evaluation

${skillInvocation('Skill(skill="forge:eval", args="--type journey --target 850")')}

${recordFields(EVAL_RECORD_FIELDS)}

Output: \`Step 2/2: Running evaluation... DONE\``
}
