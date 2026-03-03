import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../catalog.js";
import { createNoAssignmentInConditionRule } from "./rules/no-assignment-in-condition-rule.js";
import { createNoGlobalvarRule } from "./rules/no-globalvar-rule.js";
import { createNormalizeDataStructureAccessorsRule } from "./rules/normalize-data-structure-accessors-rule.js";
import { createNormalizeDirectivesRule } from "./rules/normalize-directives-rule.js";
import { createNormalizeDocCommentsRule } from "./rules/normalize-doc-comments-rule.js";
import { createNormalizeOperatorAliasesRule } from "./rules/normalize-operator-aliases-rule.js";
import { createOptimizeLogicalFlowRule } from "./rules/optimize-logical-flow-rule.js";
import { createOptimizeMathExpressionsRule } from "./rules/optimize-math-expressions-rule.js";
import { createPreferEpsilonComparisonsRule } from "./rules/prefer-epsilon-comparisons-rule.js";
import { createPreferHoistableLoopAccessorsRule } from "./rules/prefer-hoistable-loop-accessors-rule.js";
import { createPreferIsUndefinedCheckRule } from "./rules/prefer-is-undefined-check-rule.js";
import { createPreferLoopLengthHoistRule } from "./rules/prefer-loop-length-hoist-rule.js";
import { createPreferRepeatLoopsRule } from "./rules/prefer-repeat-loops-rule.js";
import { createPreferStringInterpolationRule } from "./rules/prefer-string-interpolation-rule.js";
import { createPreferStructLiteralAssignmentsRule } from "./rules/prefer-struct-literal-assignments-rule.js";
import { createRequireArgumentSeparatorsRule } from "./rules/require-argument-separators-rule.js";
import { createRequireControlFlowBracesRule } from "./rules/require-control-flow-braces-rule.js";
import { createRequireTrailingOptionalDefaultsRule } from "./rules/require-trailing-optional-defaults-rule.js";

export function createGmlRule(definition: GmlRuleDefinition): Rule.RuleModule {
    switch (definition.shortName) {
        case "prefer-loop-length-hoist": {
            return createPreferLoopLengthHoistRule(definition);
        }
        case "prefer-hoistable-loop-accessors": {
            return createPreferHoistableLoopAccessorsRule(definition);
        }
        case "prefer-repeat-loops": {
            return createPreferRepeatLoopsRule(definition);
        }
        case "prefer-struct-literal-assignments": {
            return createPreferStructLiteralAssignmentsRule(definition);
        }
        case "optimize-logical-flow": {
            return createOptimizeLogicalFlowRule(definition);
        }
        case "no-globalvar": {
            return createNoGlobalvarRule(definition);
        }
        case "normalize-doc-comments": {
            return createNormalizeDocCommentsRule(definition);
        }
        case "normalize-directives": {
            return createNormalizeDirectivesRule(definition);
        }
        case "require-control-flow-braces": {
            return createRequireControlFlowBracesRule(definition);
        }
        case "no-assignment-in-condition": {
            return createNoAssignmentInConditionRule(definition);
        }
        case "prefer-is-undefined-check": {
            return createPreferIsUndefinedCheckRule(definition);
        }
        case "prefer-epsilon-comparisons": {
            return createPreferEpsilonComparisonsRule(definition);
        }
        case "normalize-operator-aliases": {
            return createNormalizeOperatorAliasesRule(definition);
        }
        case "prefer-string-interpolation": {
            return createPreferStringInterpolationRule(definition);
        }
        case "optimize-math-expressions": {
            return createOptimizeMathExpressionsRule(definition);
        }
        case "require-argument-separators": {
            return createRequireArgumentSeparatorsRule(definition);
        }
        case "normalize-data-structure-accessors": {
            return createNormalizeDataStructureAccessorsRule(definition);
        }
        case "require-trailing-optional-defaults": {
            return createRequireTrailingOptionalDefaultsRule(definition);
        }
        default: {
            throw new Error(`Missing gml rule implementation for shortName '${definition.shortName}'.`);
        }
    }
}
