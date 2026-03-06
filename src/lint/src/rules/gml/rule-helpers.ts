import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

// Re-export from the canonical location in Core so lint rules can continue
// importing dominantLineEnding from this helper without a wide-scale refactor.
// The authoritative implementation now lives in @gml-modules/core (line-breaks).
export const { dominantLineEnding } = Core;

export function readObjectOption(context: Rule.RuleContext): Record<string, unknown> {
    if (!Array.isArray(context.options)) {
        return Object.freeze({});
    }

    const [rawOption] = context.options;
    if (!rawOption || typeof rawOption !== "object") {
        return Object.freeze({});
    }

    return rawOption as Record<string, unknown>;
}

export function shouldReportUnsafe(context: Rule.RuleContext): boolean {
    const option = readObjectOption(context).reportUnsafe;
    return option === undefined ? true : option === true;
}

export function isIdentifier(value: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}
