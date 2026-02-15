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
    const ordered = [...operations].sort((left, right) => left.range[0] - right.range[0]);
    let output = "";
    let cursor = 0;
    for (const operation of ordered) {
        const [start, end] = operation.range;
        output += text.slice(cursor, start);
        output += operation.text;
        cursor = operation.kind === "replace" ? end : start;
    }

    output += text.slice(cursor);
    return output;
}
