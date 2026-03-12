import { Core } from "@gmloop/core";

import type {
    NamingCaseStyle,
    NamingCategory,
    NamingConventionPolicy,
    NamingRuleConfig,
    ResolvedNamingConventionRules,
    ResolvedNamingRule
} from "./types.js";

export const NAMING_CASE_STYLES: ReadonlyArray<NamingCaseStyle> = Object.freeze([
    "lower",
    "upper",
    "camel",
    "lower_snake",
    "upper_snake",
    "pascal"
]);

export const NAMING_CATEGORY_PARENTS: Readonly<Record<NamingCategory, NamingCategory | null>> = Object.freeze({
    resource: null,
    scriptResourceName: "resource",
    objectResourceName: "resource",
    roomResourceName: "resource",
    spriteResourceName: "resource",
    audioResourceName: "resource",
    timelineResourceName: "resource",
    shaderResourceName: "resource",
    fontResourceName: "resource",
    pathResourceName: "resource",
    sequenceResourceName: "resource",
    tilesetResourceName: "resource",
    variable: null,
    localVariable: "variable",
    globalVariable: "variable",
    instanceVariable: "variable",
    staticVariable: "variable",
    argument: "variable",
    catchArgument: "variable",
    loopIndexVariable: "localVariable",
    callable: null,
    function: "callable",
    constructorFunction: "callable",
    eventHandlerFunction: "callable",
    structMethod: "callable",
    staticMethod: "callable",
    typeName: null,
    structDeclaration: "typeName",
    enum: "typeName",
    member: null,
    structField: "member",
    enumMember: "member",
    constant: null,
    macro: "constant"
});

type RuntimeResolvedNamingRule = ResolvedNamingRule & {
    enforceCaseStyle: boolean;
};

const NAMING_CATEGORY_SET = new Set(Object.keys(NAMING_CATEGORY_PARENTS));
const NAMING_CASE_STYLE_SET: ReadonlySet<string> = new Set(NAMING_CASE_STYLES);

function isNamingCategory(value: unknown): value is NamingCategory {
    return typeof value === "string" && NAMING_CATEGORY_SET.has(value);
}

function isNamingCaseStyle(value: unknown): value is NamingCaseStyle {
    return typeof value === "string" && NAMING_CASE_STYLE_SET.has(value);
}

function assertPlainObject(value: unknown, context: string): Record<string, unknown> {
    return Core.assertPlainObject(value, {
        errorMessage: `${context} must be a plain object`
    });
}

function normalizeStringArray(value: unknown, context: string): Array<string> {
    const array = Core.assertArray(value, {
        errorMessage: `${context} must be an array`
    });

    return array.map((entry, index) => {
        if (typeof entry !== "string") {
            throw new TypeError(`${context}[${index}] must be a string, received ${typeof entry}`);
        }

        return entry;
    });
}

function normalizeNamingRuleConfig(config: unknown, context: string): NamingRuleConfig {
    const object = assertPlainObject(config, context);
    const allowedKeys = new Set([
        "caseStyle",
        "prefix",
        "suffix",
        "minChars",
        "maxChars",
        "bannedPrefixes",
        "bannedSuffixes"
    ]);

    for (const key of Object.keys(object)) {
        if (!allowedKeys.has(key)) {
            throw new TypeError(`${context} contains unknown property ${JSON.stringify(key)}`);
        }
    }

    const normalized: NamingRuleConfig = {};

    if (object.caseStyle !== undefined) {
        if (!isNamingCaseStyle(object.caseStyle)) {
            throw new TypeError(`${context}.caseStyle must be one of ${NAMING_CASE_STYLES.join(", ")}`);
        }
        normalized.caseStyle = object.caseStyle;
    }

    if (object.prefix !== undefined) {
        if (typeof object.prefix !== "string") {
            throw new TypeError(`${context}.prefix must be a string`);
        }
        normalized.prefix = object.prefix;
    }

    if (object.suffix !== undefined) {
        if (typeof object.suffix !== "string") {
            throw new TypeError(`${context}.suffix must be a string`);
        }
        normalized.suffix = object.suffix;
    }

    if (object.minChars !== undefined) {
        if (!Number.isInteger(object.minChars) || (object.minChars as number) < 0) {
            throw new TypeError(`${context}.minChars must be a non-negative integer`);
        }
        normalized.minChars = object.minChars as number;
    }

    if (object.maxChars !== undefined) {
        if (!Number.isInteger(object.maxChars) || (object.maxChars as number) < 0) {
            throw new TypeError(`${context}.maxChars must be a non-negative integer`);
        }
        normalized.maxChars = object.maxChars as number;
    }

    if (
        normalized.minChars !== undefined &&
        normalized.maxChars !== undefined &&
        normalized.minChars > normalized.maxChars
    ) {
        throw new TypeError(`${context}.minChars must be less than or equal to ${context}.maxChars`);
    }

    if (object.bannedPrefixes !== undefined) {
        normalized.bannedPrefixes = normalizeStringArray(object.bannedPrefixes, `${context}.bannedPrefixes`);
    }

    if (object.bannedSuffixes !== undefined) {
        normalized.bannedSuffixes = normalizeStringArray(object.bannedSuffixes, `${context}.bannedSuffixes`);
    }

    return normalized;
}

function normalizeExclusiveAffixMap(value: unknown, context: string): Record<string, NamingCategory> | undefined {
    if (value === undefined) {
        return undefined;
    }

    const object = assertPlainObject(value, context);
    const normalized: Record<string, NamingCategory> = {};

    for (const [affix, categoryValue] of Object.entries(object)) {
        if (!isNamingCategory(categoryValue)) {
            throw new TypeError(`${context}.${affix} must reference a known naming category`);
        }
        normalized[affix] = categoryValue;
    }

    return normalized;
}

/**
 * Normalize and validate a user-authored naming convention policy.
 */
export function normalizeNamingConventionPolicy(
    policy: NamingConventionPolicy | undefined,
    context = "namingConventionPolicy"
): NamingConventionPolicy {
    if (policy === undefined) {
        return {
            rules: {}
        };
    }

    const object = assertPlainObject(policy, context);
    const allowedKeys = new Set(["rules", "exclusivePrefixes", "exclusiveSuffixes"]);

    for (const key of Object.keys(object)) {
        if (!allowedKeys.has(key)) {
            throw new TypeError(`${context} contains unknown property ${JSON.stringify(key)}`);
        }
    }

    const rulesObject = assertPlainObject(object.rules ?? {}, `${context}.rules`);
    const rules: NamingConventionPolicy["rules"] = {};

    for (const [rawCategory, rawRule] of Object.entries(rulesObject)) {
        if (!isNamingCategory(rawCategory)) {
            throw new TypeError(`${context}.rules contains unknown category ${JSON.stringify(rawCategory)}`);
        }

        const category = rawCategory;
        rules[category] =
            rawRule === false ? false : normalizeNamingRuleConfig(rawRule, `${context}.rules.${category}`);
    }

    return {
        rules,
        exclusivePrefixes: normalizeExclusiveAffixMap(object.exclusivePrefixes, `${context}.exclusivePrefixes`),
        exclusiveSuffixes: normalizeExclusiveAffixMap(object.exclusiveSuffixes, `${context}.exclusiveSuffixes`)
    };
}

function resolveRuleChain(
    policy: NamingConventionPolicy,
    category: NamingCategory
): Array<{ category: NamingCategory; rule: NamingRuleConfig | false }> {
    const chain: Array<{ category: NamingCategory; rule: NamingRuleConfig | false }> = [];
    let cursor: NamingCategory | null = category;

    while (cursor) {
        const rule = policy.rules[cursor];
        if (rule !== undefined) {
            chain.unshift({
                category: cursor,
                rule
            });
        }
        cursor = NAMING_CATEGORY_PARENTS[cursor];
    }

    return chain;
}

/**
 * Resolve inherited naming rules for every supported naming category.
 */
export function resolveNamingConventionRules(policy: NamingConventionPolicy): ResolvedNamingConventionRules {
    const resolved: ResolvedNamingConventionRules = {};

    for (const category of Object.keys(NAMING_CATEGORY_PARENTS) as Array<NamingCategory>) {
        const chain = resolveRuleChain(policy, category);
        if (chain.length === 0) {
            continue;
        }

        let disabled = false;
        let sawCaseStyle = false;
        const runtimeRule: RuntimeResolvedNamingRule = {
            prefix: "",
            suffix: "",
            caseStyle: "camel",
            enforceCaseStyle: false,
            minChars: null,
            maxChars: null,
            bannedPrefixes: [],
            bannedSuffixes: []
        };

        for (const entry of chain) {
            if (entry.rule === false) {
                disabled = true;
                break;
            }

            if (entry.rule.prefix !== undefined) {
                runtimeRule.prefix = entry.rule.prefix;
            }
            if (entry.rule.suffix !== undefined) {
                runtimeRule.suffix = entry.rule.suffix;
            }
            if (entry.rule.caseStyle !== undefined) {
                runtimeRule.caseStyle = entry.rule.caseStyle;
                sawCaseStyle = true;
            }
            if (entry.rule.minChars !== undefined) {
                runtimeRule.minChars = entry.rule.minChars;
            }
            if (entry.rule.maxChars !== undefined) {
                runtimeRule.maxChars = entry.rule.maxChars;
            }
            if (entry.rule.bannedPrefixes !== undefined) {
                runtimeRule.bannedPrefixes = [...entry.rule.bannedPrefixes];
            }
            if (entry.rule.bannedSuffixes !== undefined) {
                runtimeRule.bannedSuffixes = [...entry.rule.bannedSuffixes];
            }
        }

        if (!disabled) {
            runtimeRule.enforceCaseStyle = sawCaseStyle;
            resolved[category] = runtimeRule;
        }
    }

    return resolved;
}

function splitIdentifierWords(value: string): Array<string> {
    const normalized = value
        .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replaceAll(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .replaceAll(/[_\-\s]+/g, " ")
        .trim();

    if (normalized.length === 0) {
        return [];
    }

    return normalized
        .split(" ")
        .map((word) => word.toLowerCase())
        .filter((word) => word.length > 0);
}

function capitalize(word: string): string {
    return word.length === 0 ? word : `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`;
}

/**
 * Rewrite an identifier core into the requested naming case style.
 */
export function formatNamingCaseStyle(value: string, caseStyle: NamingCaseStyle): string {
    const words = splitIdentifierWords(value);
    if (words.length === 0) {
        return "";
    }

    if (caseStyle === "lower") {
        return words.join("").toLowerCase();
    }

    if (caseStyle === "upper") {
        return words.join("").toUpperCase();
    }

    if (caseStyle === "camel") {
        return words[0] + words.slice(1).map(capitalize).join("");
    }

    if (caseStyle === "pascal") {
        return words.map(capitalize).join("");
    }

    if (caseStyle === "lower_snake") {
        return words.join("_");
    }

    return words.join("_").toUpperCase();
}

function longestMatchingAffix(
    input: string,
    affixes: Record<string, NamingCategory> | undefined,
    position: "prefix" | "suffix"
): [string, NamingCategory] | null {
    if (!affixes) {
        return null;
    }

    let bestMatch: [string, NamingCategory] | null = null;
    for (const [affix, category] of Object.entries(affixes)) {
        const matches = position === "prefix" ? input.startsWith(affix) : input.endsWith(affix);
        if (!matches) {
            continue;
        }

        if (!bestMatch || affix.length > bestMatch[0].length) {
            bestMatch = [affix, category];
        }
    }

    return bestMatch;
}

function stripAffix(value: string, affix: string, position: "prefix" | "suffix"): string {
    if (affix.length === 0) {
        return value;
    }

    return position === "prefix" ? value.slice(affix.length) : value.slice(0, Math.max(0, value.length - affix.length));
}

function stripKnownAffixes(
    currentName: string,
    rule: RuntimeResolvedNamingRule,
    policy: NamingConventionPolicy,
    category: NamingCategory
): string {
    let coreName = currentName;

    if (rule.prefix.length > 0 && coreName.startsWith(rule.prefix)) {
        coreName = stripAffix(coreName, rule.prefix, "prefix");
    } else {
        const exclusivePrefix = longestMatchingAffix(coreName, policy.exclusivePrefixes, "prefix");
        if (exclusivePrefix && exclusivePrefix[1] !== category) {
            coreName = stripAffix(coreName, exclusivePrefix[0], "prefix");
        } else {
            for (const prefix of [...rule.bannedPrefixes].sort((left, right) => right.length - left.length)) {
                if (prefix.length > 0 && coreName.startsWith(prefix)) {
                    coreName = stripAffix(coreName, prefix, "prefix");
                    break;
                }
            }
        }
    }

    if (rule.suffix.length > 0 && coreName.endsWith(rule.suffix)) {
        coreName = stripAffix(coreName, rule.suffix, "suffix");
    } else {
        const exclusiveSuffix = longestMatchingAffix(coreName, policy.exclusiveSuffixes, "suffix");
        if (exclusiveSuffix && exclusiveSuffix[1] !== category) {
            coreName = stripAffix(coreName, exclusiveSuffix[0], "suffix");
        } else {
            for (const suffix of [...rule.bannedSuffixes].sort((left, right) => right.length - left.length)) {
                if (suffix.length > 0 && coreName.endsWith(suffix)) {
                    coreName = stripAffix(coreName, suffix, "suffix");
                    break;
                }
            }
        }
    }

    return coreName;
}

/**
 * Evaluate a single identifier against the resolved naming policy.
 */
export function evaluateNamingConvention(
    currentName: string,
    category: NamingCategory,
    policy: NamingConventionPolicy,
    resolvedRules: ResolvedNamingConventionRules
): { compliant: boolean; suggestedName: string | null; message: string | null } {
    const rule = resolvedRules[category] as RuntimeResolvedNamingRule | undefined;
    if (!rule) {
        return {
            compliant: true,
            suggestedName: currentName,
            message: null
        };
    }

    let issueMessage: string | null = null;
    const coreName = stripKnownAffixes(currentName, rule, policy, category);
    const exclusivePrefix = longestMatchingAffix(currentName, policy.exclusivePrefixes, "prefix");
    const exclusiveSuffix = longestMatchingAffix(currentName, policy.exclusiveSuffixes, "suffix");

    if (rule.bannedPrefixes.some((prefix) => prefix.length > 0 && currentName.startsWith(prefix))) {
        issueMessage = `Identifier ${JSON.stringify(currentName)} uses a banned prefix for ${category}.`;
    } else if (rule.bannedSuffixes.some((suffix) => suffix.length > 0 && currentName.endsWith(suffix))) {
        issueMessage = `Identifier ${JSON.stringify(currentName)} uses a banned suffix for ${category}.`;
    } else if (exclusivePrefix && exclusivePrefix[1] !== category) {
        issueMessage = `Identifier ${JSON.stringify(currentName)} uses reserved prefix ${JSON.stringify(exclusivePrefix[0])}.`;
    } else if (exclusiveSuffix && exclusiveSuffix[1] !== category) {
        issueMessage = `Identifier ${JSON.stringify(currentName)} uses reserved suffix ${JSON.stringify(exclusiveSuffix[0])}.`;
    } else if (rule.prefix.length > 0 && !currentName.startsWith(rule.prefix)) {
        issueMessage = `Identifier ${JSON.stringify(currentName)} must start with ${JSON.stringify(rule.prefix)}.`;
    } else if (rule.suffix.length > 0 && !currentName.endsWith(rule.suffix)) {
        issueMessage = `Identifier ${JSON.stringify(currentName)} must end with ${JSON.stringify(rule.suffix)}.`;
    } else if (rule.minChars !== null && coreName.length < rule.minChars) {
        issueMessage = `Identifier ${JSON.stringify(currentName)} is shorter than the minimum core length ${rule.minChars}.`;
    } else if (rule.maxChars !== null && coreName.length > rule.maxChars) {
        issueMessage = `Identifier ${JSON.stringify(currentName)} exceeds the maximum core length ${rule.maxChars}.`;
    } else if (rule.enforceCaseStyle) {
        const expectedCoreName = formatNamingCaseStyle(coreName, rule.caseStyle);
        if (expectedCoreName !== coreName) {
            issueMessage = `Identifier ${JSON.stringify(currentName)} does not match ${rule.caseStyle} case.`;
        }
    }

    if (issueMessage === null) {
        return {
            compliant: true,
            suggestedName: currentName,
            message: null
        };
    }

    if (
        (rule.minChars !== null && coreName.length < rule.minChars) ||
        (rule.maxChars !== null && coreName.length > rule.maxChars)
    ) {
        return {
            compliant: false,
            suggestedName: null,
            message: issueMessage
        };
    }

    const formattedCoreName = rule.enforceCaseStyle ? formatNamingCaseStyle(coreName, rule.caseStyle) : coreName;
    const suggestedName = `${rule.prefix}${formattedCoreName}${rule.suffix}`;

    return {
        compliant: suggestedName === currentName,
        suggestedName,
        message: issueMessage
    };
}
