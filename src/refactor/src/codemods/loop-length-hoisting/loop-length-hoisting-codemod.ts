import { Core } from "@gmloop/core";
import { Parser } from "@gmloop/parser";

import type {
    LoopLengthHoistingCodemodOptions,
    LoopLengthHoistingCodemodResult,
    LoopLengthHoistingEdit
} from "./types.js";

const DEFAULT_HOIST_ACCESSORS = Object.freeze({
    array_length: "len"
});

type ForStatementContainerContext = Readonly<{
    forNode: Record<string, unknown>;
    canInsertHoistBeforeLoop: boolean;
}>;

type LoopLengthHoistRewrite = Readonly<{
    insertionOffset: number;
    insertionText: string;
    callRewrites: ReadonlyArray<LoopLengthHoistingEdit>;
    reportOffset: number;
}>;

function getLineStartOffset(sourceText: string, offset: number): number {
    return sourceText.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

function getLineIndentationAtOffset(sourceText: string, offset: number): string {
    const lineStart = getLineStartOffset(sourceText, offset);
    let cursor = lineStart;
    while (cursor < sourceText.length && (sourceText[cursor] === " " || sourceText[cursor] === "\t")) {
        cursor += 1;
    }

    return sourceText.slice(lineStart, cursor);
}

function collectIdentifierNamesInSubtree(rootNode: unknown): ReadonlySet<string> {
    const names = new Set<string>();
    Core.walkAst(rootNode, (node) => {
        if (node?.type !== "Identifier" || typeof node.name !== "string") {
            return;
        }

        names.add(node.name);
    });

    return names;
}

function collectForStatementContainerContexts(programNode: unknown): ReadonlyArray<ForStatementContainerContext> {
    const contexts: Array<ForStatementContainerContext> = [];

    const visitValue = (value: unknown, canInsertHoistBeforeLoop: boolean): void => {
        if (!value || typeof value !== "object") {
            return;
        }

        if (Array.isArray(value)) {
            for (const entry of value) {
                visitValue(entry, false);
            }

            return;
        }

        const node = value as Record<string, unknown>;
        if (node.type === "ForStatement") {
            contexts.push(
                Object.freeze({
                    forNode: node,
                    canInsertHoistBeforeLoop
                })
            );
        }

        for (const [propertyName, propertyValue] of Object.entries(node)) {
            if (
                propertyName === "body" &&
                Array.isArray(propertyValue) &&
                (node.type === "Program" || node.type === "BlockStatement")
            ) {
                for (const statement of propertyValue) {
                    visitValue(statement, true);
                }

                continue;
            }

            visitValue(propertyValue, false);
        }
    };

    visitValue(programNode, false);
    return contexts;
}

function resolveLoopLengthHoistIdentifierName(
    preferredName: string,
    inScopeIdentifierNames: ReadonlySet<string>
): string | null {
    if (!Core.GML_IDENTIFIER_NAME_PATTERN.test(preferredName)) {
        return null;
    }

    if (!inScopeIdentifierNames.has(preferredName)) {
        return preferredName;
    }

    let suffix = 2;
    while (suffix < Number.MAX_SAFE_INTEGER) {
        const candidateName = `${preferredName}${String(suffix)}`;
        if (!inScopeIdentifierNames.has(candidateName)) {
            return candidateName;
        }

        suffix += 1;
    }

    return null;
}

function createLoopLengthHoistRewrite(parameters: {
    sourceText: string;
    loopContext: ForStatementContainerContext;
    suffixMap: ReadonlyMap<string, string>;
    localIdentifierNames: ReadonlySet<string>;
    lineEnding: string;
}): LoopLengthHoistRewrite | null {
    const { forNode, canInsertHoistBeforeLoop } = parameters.loopContext;
    if (!canInsertHoistBeforeLoop) {
        return null;
    }

    const accessorCalls = Core.collectLoopLengthAccessorCallsFromAstNode({
        sourceText: parameters.sourceText,
        rootNode: forNode.test,
        enabledFunctionNames: new Set(parameters.suffixMap.keys())
    });

    if (accessorCalls.length === 0) {
        return null;
    }

    const firstCall = accessorCalls[0];
    const preferredSuffix = parameters.suffixMap.get(firstCall.functionName) ?? "len";
    const hoistedName = resolveLoopLengthHoistIdentifierName(preferredSuffix, parameters.localIdentifierNames);
    if (!hoistedName) {
        return null;
    }

    const forNodeStart = Core.getNodeStartIndex(forNode);
    const insertionOffset = typeof forNodeStart === "number" ? forNodeStart : 0;
    const indentation = getLineIndentationAtOffset(parameters.sourceText, insertionOffset);
    const insertionText = `var ${hoistedName} = ${firstCall.callText};${parameters.lineEnding}${indentation}`;

    const callRewrites = accessorCalls
        .filter((call) => call.functionName === firstCall.functionName && call.callText === firstCall.callText)
        .map((call) =>
            Object.freeze({
                start: call.callStart,
                end: call.callEnd,
                text: hoistedName
            })
        );

    return Object.freeze({
        insertionOffset,
        insertionText,
        callRewrites,
        reportOffset: firstCall.callStart
    });
}

function applySourceTextEdits(sourceText: string, edits: ReadonlyArray<LoopLengthHoistingEdit>): string {
    if (edits.length === 0) {
        return sourceText;
    }

    const sorted = [...edits].toSorted((left, right) => right.start - left.start || right.end - left.end);
    let output = sourceText;

    for (const edit of sorted) {
        output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`;
    }

    return output;
}

/**
 * Applies the loop-length hoisting codemod to a single GML source file.
 *
 * The codemod rewrites `for` loop tests that repeatedly call configured
 * length accessors (for example `array_length(items)`) by inserting a cached
 * local variable before the loop and replacing test-call sites with that
 * cached identifier.
 */
export function applyLoopLengthHoistingCodemod(
    sourceText: string,
    options: LoopLengthHoistingCodemodOptions = {}
): LoopLengthHoistingCodemodResult {
    if (!Core.isNonEmptyString(sourceText)) {
        return Object.freeze({
            changed: false,
            outputText: sourceText,
            appliedEdits: Object.freeze([]),
            diagnosticOffsets: Object.freeze([])
        });
    }

    const suffixMap = Core.resolveIdentifierKeyedSuffixMap(DEFAULT_HOIST_ACCESSORS, options.functionSuffixes);
    if (suffixMap.size === 0) {
        return Object.freeze({
            changed: false,
            outputText: sourceText,
            appliedEdits: Object.freeze([]),
            diagnosticOffsets: Object.freeze([])
        });
    }

    let ast: unknown;
    try {
        ast = Parser.GMLParser.parse(sourceText);
    } catch {
        return Object.freeze({
            changed: false,
            outputText: sourceText,
            appliedEdits: Object.freeze([]),
            diagnosticOffsets: Object.freeze([])
        });
    }

    const localIdentifierNames = new Set(collectIdentifierNamesInSubtree(ast));
    const lineEnding = Core.dominantLineEnding(sourceText);
    const loopContexts = collectForStatementContainerContexts(ast);

    const edits: Array<LoopLengthHoistingEdit> = [];
    const diagnosticOffsets: Array<number> = [];

    for (const loopContext of loopContexts) {
        const rewrite = createLoopLengthHoistRewrite({
            sourceText,
            loopContext,
            suffixMap,
            localIdentifierNames,
            lineEnding
        });

        if (!rewrite) {
            continue;
        }

        edits.push(
            Object.freeze({
                start: rewrite.insertionOffset,
                end: rewrite.insertionOffset,
                text: rewrite.insertionText
            }),
            ...rewrite.callRewrites
        );

        const hoistedIdentifierName = rewrite.callRewrites[0]?.text;
        if (Core.isNonEmptyString(hoistedIdentifierName)) {
            localIdentifierNames.add(hoistedIdentifierName);
        }
        diagnosticOffsets.push(rewrite.reportOffset);
    }

    const outputText = applySourceTextEdits(sourceText, edits);
    return Object.freeze({
        changed: outputText !== sourceText,
        outputText,
        appliedEdits: Object.freeze(edits),
        diagnosticOffsets: Object.freeze(diagnosticOffsets)
    });
}
