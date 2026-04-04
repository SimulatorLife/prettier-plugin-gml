import { Core } from "@gmloop/core";

import { assertRefactorConfigPlainObject } from "./refactor-config-assertions.js";
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
    animationCurveResourceName: "resource",
    sequenceResourceName: "resource",
    tilesetResourceName: "resource",
    particleSystemResourceName: "resource",
    noteResourceName: "resource",
    extensionResourceName: "resource",
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
    typeName: null,
    structDeclaration: "typeName",
    constructorFunction: "structDeclaration",
    enum: "typeName",
    member: null,
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
    const object = assertRefactorConfigPlainObject(config, context);
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

    const object = assertRefactorConfigPlainObject(value, context);
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

    const object = assertRefactorConfigPlainObject(policy, context);
    const allowedKeys = new Set(["rules", "exclusivePrefixes", "exclusiveSuffixes"]);

    for (const key of Object.keys(object)) {
        if (!allowedKeys.has(key)) {
            throw new TypeError(`${context} contains unknown property ${JSON.stringify(key)}`);
        }
    }

    const rulesObject = assertRefactorConfigPlainObject(object.rules ?? {}, `${context}.rules`);
    const rules: NamingConventionPolicy["rules"] = {};

    for (const [rawCategory, rawRule] of Object.entries(rulesObject)) {
        if (!isNamingCategory(rawCategory)) {
            throw new TypeError(`${context}.rules contains unknown category ${JSON.stringify(rawCategory)}`);
        }

        const category = rawCategory;
        rules[category] =
            rawRule === false ? false : normalizeNamingRuleConfig(rawRule, `${context}.rules.${category}`);
    }

    const exclusivePrefixes = normalizeExclusiveAffixMap(object.exclusivePrefixes, `${context}.exclusivePrefixes`);
    const exclusiveSuffixes = normalizeExclusiveAffixMap(object.exclusiveSuffixes, `${context}.exclusiveSuffixes`);

    return {
        rules,
        ...(exclusivePrefixes ? { exclusivePrefixes } : {}),
        ...(exclusiveSuffixes ? { exclusiveSuffixes } : {})
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
                // Sort descending by length so stripOneAffixDirection can iterate
                // without creating a sorted copy on every identifier evaluation.
                runtimeRule.bannedPrefixes = [...entry.rule.bannedPrefixes].sort((a, b) => b.length - a.length);
            }
            if (entry.rule.bannedSuffixes !== undefined) {
                runtimeRule.bannedSuffixes = [...entry.rule.bannedSuffixes].sort((a, b) => b.length - a.length);
            }
        }

        if (!disabled) {
            runtimeRule.enforceCaseStyle = sawCaseStyle;
            runtimeRule.bannedPrefixes = [...runtimeRule.bannedPrefixes].sort((a, b) => b.length - a.length);
            runtimeRule.bannedSuffixes = [...runtimeRule.bannedSuffixes].sort((a, b) => b.length - a.length);
            resolved[category] = runtimeRule;
        }
    }

    return resolved;
}

function splitIdentifierWords(value: string): Array<string> {
    const normalized = value
        .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
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

type IdentifierUnderscoreAffixes = {
    core: string;
    leading: string;
    trailing: string;
};

function splitIdentifierUnderscoreAffixes(value: string): IdentifierUnderscoreAffixes {
    const leading = value.match(/^_+/)?.[0] ?? "";
    const trailing = value.match(/_+$/)?.[0] ?? "";
    const coreStart = leading.length;
    const coreEnd = Math.max(coreStart, value.length - trailing.length);

    return {
        leading,
        core: value.slice(coreStart, coreEnd),
        trailing: value.slice(coreEnd)
    };
}

/**
 * Rewrite an identifier core into the requested naming case style.
 */
export function formatNamingCaseStyle(value: string, caseStyle: NamingCaseStyle): string {
    const underscoreAffixes = splitIdentifierUnderscoreAffixes(value);
    const words = splitIdentifierWords(underscoreAffixes.core);
    if (underscoreAffixes.core.length === 0) {
        return `${underscoreAffixes.leading}${underscoreAffixes.trailing}`;
    }

    if (words.length === 0) {
        return `${underscoreAffixes.leading}${underscoreAffixes.core}${underscoreAffixes.trailing}`;
    }

    const formattedCore =
        caseStyle === "lower"
            ? words.join("").toLowerCase()
            : caseStyle === "upper"
              ? words.join("").toUpperCase()
              : caseStyle === "camel"
                ? words[0] + words.slice(1).map(capitalize).join("")
                : caseStyle === "pascal"
                  ? words.map(capitalize).join("")
                  : caseStyle === "lower_snake"
                    ? words.join("_")
                    : words.join("_").toUpperCase();

    return `${underscoreAffixes.leading}${formattedCore}${underscoreAffixes.trailing}`;
}

function attachesDirectlyToIdentifierCore(affix: string): boolean {
    return affix.length > 0 && /[A-Za-z0-9]$/u.test(affix);
}

function formatCoreNameForRule(coreName: string, rule: RuntimeResolvedNamingRule): string {
    if (rule.caseStyle === "camel" && attachesDirectlyToIdentifierCore(rule.prefix)) {
        return formatNamingCaseStyle(coreName, "pascal");
    }

    return formatNamingCaseStyle(coreName, rule.caseStyle);
}

function composeExpectedIdentifierName(coreName: string, rule: RuntimeResolvedNamingRule): string {
    const formattedCoreName = rule.enforceCaseStyle ? formatCoreNameForRule(coreName, rule) : coreName;
    return `${rule.prefix}${formattedCoreName}${rule.suffix}`;
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

/**
 * Strip a single affix direction (prefix or suffix) from `coreName`, using the same
 * three-priority resolution order for both directions:
 *   1. The rule's required affix takes precedence.
 *   2. An exclusive affix that belongs to a different category is stripped next.
 *   3. The longest matching banned affix is stripped as a last resort.
 *
 * `bannedAffixes` must already be sorted by descending length (longest first) so
 * this function can iterate them directly without allocating a sorted copy.
 */
function stripOneAffixDirection(
    coreName: string,
    ruleAffix: string,
    bannedAffixes: ReadonlyArray<string>,
    exclusiveAffixes: Record<string, NamingCategory> | undefined,
    position: "prefix" | "suffix",
    category: NamingCategory
): string {
    const isPrefix = position === "prefix";

    if (ruleAffix.length > 0) {
        const matches = isPrefix ? coreName.startsWith(ruleAffix) : coreName.endsWith(ruleAffix);
        if (matches) {
            return stripAffix(coreName, ruleAffix, position);
        }
    }

    const exclusive = longestMatchingAffix(coreName, exclusiveAffixes, position);
    if (exclusive && exclusive[1] !== category) {
        return stripAffix(coreName, exclusive[0], position);
    }

    // bannedAffixes is pre-sorted descending by length in resolveNamingConventionRules,
    // so we can iterate without creating an intermediate sorted copy.
    for (const banned of bannedAffixes) {
        if (banned.length > 0) {
            const matches = isPrefix ? coreName.startsWith(banned) : coreName.endsWith(banned);
            if (matches) {
                return stripAffix(coreName, banned, position);
            }
        }
    }

    return coreName;
}

function stripKnownAffixes(
    currentName: string,
    rule: RuntimeResolvedNamingRule,
    policy: NamingConventionPolicy,
    category: NamingCategory
): string {
    const withoutPrefix = stripOneAffixDirection(
        currentName,
        rule.prefix,
        rule.bannedPrefixes,
        policy.exclusivePrefixes,
        "prefix",
        category
    );
    return stripOneAffixDirection(
        withoutPrefix,
        rule.suffix,
        rule.bannedSuffixes,
        policy.exclusiveSuffixes,
        "suffix",
        category
    );
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
    // When the case-style branch detects a violation it already computes the
    // expected name, so we capture it here to avoid a second identical call to
    // composeExpectedIdentifierName at the bottom of the function.
    let precomputedSuggestedName: string | undefined;
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
        precomputedSuggestedName = composeExpectedIdentifierName(coreName, rule);
        if (precomputedSuggestedName !== currentName) {
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

    // Reuse the expected name already computed in the case-style branch when
    // available; otherwise compute it now for other violation types.
    const suggestedName = precomputedSuggestedName ?? composeExpectedIdentifierName(coreName, rule);

    return {
        compliant: suggestedName === currentName,
        suggestedName,
        message: issueMessage
    };
}
