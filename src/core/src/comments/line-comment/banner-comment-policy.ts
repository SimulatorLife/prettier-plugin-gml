/**
 * Banner comment detection policy evaluator.
 *
 * This module separates the policy decisions (thresholds, heuristics) for
 * identifying banner comments from the formatting mechanism that applies them.
 * Banner comments are decorative separators like:
 *   //============
 *   //------------
 *   //**********
 *
 * By isolating the policy rules here, we can:
 * - Test policy logic independently of formatting mechanics
 * - Adjust thresholds without touching the formatting implementation
 * - Exercise different policies in tests without modifying global state
 */

/**
 * Context information provided to the policy evaluator for banner detection.
 */
export type BannerCommentPolicyContext = {
    /** Number of consecutive leading slashes in the comment (e.g., "////" = 4) */
    leadingSlashCount: number;
    /** Whether the comment contains banner decoration characters */
    hasDecorations: boolean;
};

/**
 * Result of evaluating the banner comment policy.
 */
export type BannerCommentPolicyEvaluation = {
    /** Whether the comment qualifies as a banner and should receive special formatting */
    isBanner: boolean;
    /** Human-readable reason for the decision (useful for debugging and testing) */
    reason: string;
};

/**
 * Configuration for the banner comment detection policy.
 */
export type BannerCommentPolicyConfig = {
    /** Minimum number of leading slashes required for a comment to be considered a banner */
    minLeadingSlashes: number;
};

/**
 * Default policy configuration.
 *
 * Any line comment that starts with at least this many consecutive `/`
 * characters is considered a "banner" comment for formatting purposes.
 * - 2 slashes is the minimum to form a valid line comment in GML
 * - 3 slashes is for doc-comments
 * - 4 or more is considered decorative
 */
const DEFAULT_BANNER_COMMENT_POLICY_CONFIG: Readonly<BannerCommentPolicyConfig> = Object.freeze({
    minLeadingSlashes: 4
});

/**
 * Evaluates whether a line comment qualifies as a banner comment based on
 * configurable policy rules.
 *
 * This policy evaluator is pure: it accepts context and configuration, applies
 * heuristics, and returns a decision without performing any formatting actions.
 * The formatting mechanism can then use this decision to determine how to
 * render the comment.
 *
 * @param context - Context information about the comment being evaluated
 * @param config - Policy configuration (defaults to standard rules)
 * @returns Evaluation result with decision and reason
 */
export function evaluateBannerCommentPolicy(
    context: BannerCommentPolicyContext,
    config: BannerCommentPolicyConfig = DEFAULT_BANNER_COMMENT_POLICY_CONFIG
): BannerCommentPolicyEvaluation {
    const { leadingSlashCount, hasDecorations } = context;
    const { minLeadingSlashes } = config;

    // If the comment has enough leading slashes to meet the threshold,
    // treat it as a banner comment
    if (leadingSlashCount >= minLeadingSlashes) {
        return {
            isBanner: true,
            reason: "sufficient-leading-slashes"
        };
    }

    // Even if the slash count is below the threshold, the comment still
    // qualifies as a banner if it contains decorative characters (like
    // sequences of "=", "-", "*", etc.)
    if (hasDecorations) {
        return {
            isBanner: true,
            reason: "has-decorations"
        };
    }

    // Default: not a banner comment
    return {
        isBanner: false,
        reason: "insufficient-criteria"
    };
}

/**
 * Checks if a comment has too few slashes to be a banner, even if it might
 * have other decorative elements. This is used for early filtering.
 *
 * @param leadingSlashCount - Number of leading slashes
 * @param config - Policy configuration
 * @returns true if slash count is below the banner threshold
 */
export function isBelowBannerSlashThreshold(
    leadingSlashCount: number,
    config: BannerCommentPolicyConfig = DEFAULT_BANNER_COMMENT_POLICY_CONFIG
): boolean {
    return leadingSlashCount < config.minLeadingSlashes;
}

/**
 * Module-scoped compiled pattern for detecting decorative slash separator lines
 * inside block comments. Derived from {@link DEFAULT_BANNER_COMMENT_POLICY_CONFIG}
 * at module-evaluation time; the single shared instance is reused across all calls.
 *
 * Matches lines that consist entirely of optional leading whitespace, an optional
 * leading asterisk (for block-comment continuation lines like `* ////`), four or
 * more consecutive forward-slashes, an optional trailing asterisk, and optional
 * trailing whitespace. Examples of matching lines: `////`, `////*`, `  ////  `.
 */
const DECORATIVE_BLOCK_COMMENT_LINE_PATTERN = new RegExp(
    String.raw`^\s*\*?\/{${DEFAULT_BANNER_COMMENT_POLICY_CONFIG.minLeadingSlashes},}\*?\s*$`
);

/**
 * Tests whether a single line from a block comment is an all-slash decorative
 * separator line (e.g. `////`, `////*`).
 *
 * Leading and trailing whitespace is accepted; the caller does not need to
 * pre-trim the line. Tabs are NOT expanded — callers that require tab-aware
 * comparison should normalise the line before passing it in.
 *
 * Uses {@link DEFAULT_BANNER_COMMENT_POLICY_CONFIG} to determine the minimum
 * number of consecutive forward-slashes required (currently 4). The underlying
 * {@link RegExp} is compiled once at module-evaluation time and shared across
 * all calls to avoid per-call allocation.
 *
 * @param line - A single line from a block comment body.
 * @returns `true` when the line is a decorative slash separator.
 */
export function isDecorativeSlashCommentLine(line: string): boolean {
    return DECORATIVE_BLOCK_COMMENT_LINE_PATTERN.test(line);
}

export { DEFAULT_BANNER_COMMENT_POLICY_CONFIG };
