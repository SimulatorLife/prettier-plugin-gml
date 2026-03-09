import { Lint } from "@gml-modules/lint";

const allRuleLevels = Object.freeze(
    Object.fromEntries(
        Object.values(Lint.ruleIds).map((ruleId) => [ruleId, "error"])
    )
);

export default [
    {
        files: ["**/*.gml"],
        plugins: {
            gml: Lint.plugin,
            feather: Lint.featherPlugin
        },
        language: "gml/gml",
        rules: allRuleLevels
    }
];
