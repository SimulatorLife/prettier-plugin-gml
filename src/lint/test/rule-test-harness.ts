/**
 * Represents a fixer operation that replaces a text range with new text.
 */
export type ReplaceTextRangeFixOperation = {
    kind: "replace";
    range: [number, number];
    text: string;
};

/**
 * Represents a fixer operation that inserts text immediately after a range.
 */
export type InsertTextAfterRangeFixOperation = {
    kind: "insert-after";
    range: [number, number];
    text: string;
};

/**
 * Union of supported local test fixer operations.
 */
export type RuleTestFixOperation = ReplaceTextRangeFixOperation | InsertTextAfterRangeFixOperation;

function buildLineStarts(text: string): Array<number> {
    const starts = [0];
    for (const [index, character] of Array.from(text).entries()) {
        if (character === "\n") {
            starts.push(index + 1);
        }
    }
    return starts;
}

/**
 * Creates a location resolver that maps absolute indexes to line/column pairs.
 */
export function createLocResolver(text: string): (index: number) => { line: number; column: number } {
    const lineStarts = buildLineStarts(text);

    return (index: number) => {
        let line = 0;
        for (const [candidate, lineStart] of lineStarts.entries()) {
            if (lineStart > index) {
                break;
            }

            line = candidate;
        }

        return { line: line + 1, column: index - lineStarts[line] };
    };
}

/**
 * Applies a set of local test fixer operations in source-order.
 */
export function applyFixOperations(text: string, operations: Array<RuleTestFixOperation>): string {
    const ordered = [...operations].sort((left, right) => {
        if (left.range[0] !== right.range[0]) {
            return left.range[0] - right.range[0];
        }
        if (left.range[1] !== right.range[1]) {
            return left.range[1] - right.range[1];
        }
        return left.kind.localeCompare(right.kind);
    });
    let output = "";
    let cursor = 0;
    const appliedKeys = new Set<string>();
    for (const operation of ordered) {
        const [start, end] = operation.range;
        const operationKey = `${operation.kind}:${start}:${end}:${operation.text}`;
        if (appliedKeys.has(operationKey)) {
            continue;
        }
        appliedKeys.add(operationKey);

        // ESLint fix application ignores edits that overlap previously applied edits.
        // Mirror that behavior so tests match real fixer execution.
        if (start < cursor) {
            continue;
        }

        output += text.slice(cursor, start);
        output += operation.text;
        cursor = operation.kind === "replace" ? end : start;
    }

    output += text.slice(cursor);
    return output;
}

/**
 * Type representing a lint plugin with rules.
 */
type LintPlugin = {
    rules: Record<string, { create: (context: never) => { Program?: (node: never) => void } }>;
};

/**
 * Runs a feather rule against code and returns the messages and fixed output.
 * This is a shared test helper for testing feather lint rules.
 */
export function lintWithFeatherRule(
    plugin: LintPlugin,
    ruleName: string,
    code: string
): { messages: Array<{ messageId: string }>; output: string } {
    const rule = plugin.rules[ruleName];
    const messages: Array<{ messageId: string; fix?: ReplaceTextRangeFixOperation }> = [];
    const getLocFromIndex = createLocResolver(code);

    const context = {
        options: [{}],
        sourceCode: {
            text: code,
            getLocFromIndex
        },
        report(payload: {
            messageId: string;
            fix?: (fixer: {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation;
            }) => ReplaceTextRangeFixOperation | null;
        }) {
            const fixer = {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation {
                    return { kind: "replace", range, text };
                }
            };
            messages.push({
                messageId: payload.messageId,
                fix: payload.fix ? (payload.fix(fixer) ?? undefined) : undefined
            });
        }
    } as never;

    const listeners = rule.create(context);
    listeners.Program?.({ type: "Program" } as never);

    const output = applyFixOperations(
        code,
        messages.map((message) => message.fix).filter((fix): fix is ReplaceTextRangeFixOperation => fix !== undefined)
    );

    return {
        messages: messages.map((message) => ({ messageId: message.messageId })),
        output
    };
}
