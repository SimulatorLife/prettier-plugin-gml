import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { applySourceTextEdits, createMeta, reportFullTextRewrite, type SourceTextEdit } from "../rule-base-helpers.js";

type LineRecord = Readonly<{
    start: number;
    end: number;
    content: string;
}>;

type RegionBlockRecord = Readonly<{
    startLineIndex: number;
    endLineIndex: number;
}>;

function collectSourceLines(sourceText: string): ReadonlyArray<LineRecord> {
    const lines: Array<LineRecord> = [];
    const linePattern = /[^\r\n]*(?:\r\n|\n|$)/gu;
    let match = linePattern.exec(sourceText);

    while (match !== null) {
        const lineWithEnding = match[0] ?? "";
        if (lineWithEnding.length === 0) {
            break;
        }

        const hasCarriageReturnLineFeedEnding = lineWithEnding.endsWith("\r\n");
        const hasLineFeedEnding = !hasCarriageReturnLineFeedEnding && lineWithEnding.endsWith("\n");
        const lineEndingLength = hasCarriageReturnLineFeedEnding ? 2 : hasLineFeedEnding ? 1 : 0;

        const lineStart = match.index;
        const lineEnd = lineStart + lineWithEnding.length;
        const contentEnd = lineEnd - lineEndingLength;
        lines.push(
            Object.freeze({
                start: lineStart,
                end: lineEnd,
                content: sourceText.slice(lineStart, contentEnd)
            })
        );

        match = linePattern.exec(sourceText);
    }

    return Object.freeze(lines);
}

function readRegionDirectiveType(lineContent: string): "start" | "end" | null {
    const trimmed = lineContent.trimStart();
    if (/^#region(?:\s|$)/u.test(trimmed)) {
        return "start";
    }

    if (/^#endregion(?:\s|$)/u.test(trimmed)) {
        return "end";
    }

    return null;
}

function isRegionBodyWhitespaceOnly(
    lines: ReadonlyArray<LineRecord>,
    startLineIndex: number,
    endLineIndex: number
): boolean {
    for (let lineIndex = startLineIndex + 1; lineIndex < endLineIndex; lineIndex += 1) {
        const line = lines[lineIndex];
        if (!line) {
            continue;
        }

        if (line.content.trim().length > 0) {
            return false;
        }
    }

    return true;
}

function collectEmptyRegionBlocks(lines: ReadonlyArray<LineRecord>): ReadonlyArray<RegionBlockRecord> {
    const emptyRegionBlocks: Array<RegionBlockRecord> = [];
    const regionStartLineStack: number[] = [];

    for (const [lineIndex, line] of lines.entries()) {
        const directiveType = readRegionDirectiveType(line.content);
        if (directiveType === "start") {
            regionStartLineStack.push(lineIndex);
            continue;
        }

        if (directiveType !== "end") {
            continue;
        }

        const startLineIndex = regionStartLineStack.pop();
        if (startLineIndex === undefined) {
            continue;
        }

        if (!isRegionBodyWhitespaceOnly(lines, startLineIndex, lineIndex)) {
            continue;
        }

        emptyRegionBlocks.push(
            Object.freeze({
                startLineIndex,
                endLineIndex: lineIndex
            })
        );
    }

    return Object.freeze(emptyRegionBlocks);
}

function createEmptyRegionDeletionEdits(
    lines: ReadonlyArray<LineRecord>,
    emptyRegionBlocks: ReadonlyArray<RegionBlockRecord>
): ReadonlyArray<SourceTextEdit> {
    const edits: Array<SourceTextEdit> = [];

    for (const emptyRegionBlock of emptyRegionBlocks) {
        const startLine = lines[emptyRegionBlock.startLineIndex];
        const endLine = lines[emptyRegionBlock.endLineIndex];
        if (!startLine || !endLine) {
            continue;
        }

        edits.push(
            Object.freeze({
                start: startLine.start,
                end: endLine.end,
                text: ""
            })
        );
    }

    return Object.freeze(edits);
}

/**
 * Creates the `gml/no-empty-regions` rule.
 *
 * Reports `#region` blocks whose body is strictly whitespace and auto-fixes by
 * removing the full directive block.
 */
export function createNoEmptyRegionsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const lines = collectSourceLines(sourceText);
                    if (lines.length === 0) {
                        return;
                    }

                    const emptyRegionBlocks = collectEmptyRegionBlocks(lines);
                    if (emptyRegionBlocks.length === 0) {
                        return;
                    }

                    const deletionEdits = createEmptyRegionDeletionEdits(lines, emptyRegionBlocks);
                    if (deletionEdits.length === 0) {
                        return;
                    }

                    const rewrittenText = applySourceTextEdits(sourceText, deletionEdits);
                    reportFullTextRewrite(context, definition.messageId, sourceText, rewrittenText);
                }
            });
        }
    });
}
