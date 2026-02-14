import type { Rule } from "eslint";

export function readObjectOption(context: Rule.RuleContext): Record<string, unknown> {
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

export function dominantLineEnding(text: string): "\r\n" | "\n" {
    const crlfCount = (text.match(/\r\n/g) ?? []).length;
    const lfCount = (text.match(/(?<!\r)\n/g) ?? []).length;
    return crlfCount > lfCount ? "\r\n" : "\n";
}
