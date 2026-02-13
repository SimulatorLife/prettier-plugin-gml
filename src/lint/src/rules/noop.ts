import type { Rule } from "eslint";

export const noopRule: Rule.RuleModule = Object.freeze({
    meta: Object.freeze({
        type: "suggestion",
        docs: Object.freeze({
            description: "No-op lint scaffold rule for workspace bring-up.",
            recommended: false,
            requiresProjectContext: false
        }),
        schema: Object.freeze([]),
        messages: Object.freeze({
            noop: "No-op rule executed."
        })
    }),
    create() {
        return Object.freeze({});
    }
});
