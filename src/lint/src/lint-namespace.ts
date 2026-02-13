import { configs } from "./plugin.js";
import { plugin } from "./plugin.js";
import { featherManifest } from "./rules/feather/manifest.js";
import { services } from "./services/index.js";

function createFeatherRuleIdMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const entry of featherManifest.entries) {
        const suffix = entry.id.replace("GM", "");
        map[`FeatherGM${suffix}`] = entry.ruleId;
    }

    return map;
}

export const ruleIds = Object.freeze({
    GmlPreferLoopLengthHoist: "gml/prefer-loop-length-hoist",
    GmlPreferHoistableLoopAccessors: "gml/prefer-hoistable-loop-accessors",
    GmlPreferStructLiteralAssignments: "gml/prefer-struct-literal-assignments",
    GmlOptimizeLogicalFlow: "gml/optimize-logical-flow",
    GmlNoGlobalvar: "gml/no-globalvar",
    GmlNormalizeDocComments: "gml/normalize-doc-comments",
    GmlPreferStringInterpolation: "gml/prefer-string-interpolation",
    GmlOptimizeMathExpressions: "gml/optimize-math-expressions",
    GmlRequireArgumentSeparators: "gml/require-argument-separators",
    ...createFeatherRuleIdMap()
});

export const Lint = Object.freeze({
    plugin,
    configs,
    ruleIds,
    services
});
