import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import {
    type AstNodeWithType,
    createMeta,
    getNodeEndIndex,
    getNodeStartIndex,
    isAstNodeRecord,
    isAstNodeWithType,
    walkAstNodes,
    walkAstNodesWithParent
} from "../rule-base-helpers.js";
import { isIdentifier, readObjectOption, shouldReportUnsafe } from "../rule-helpers.js";

const DEFAULT_HOIST_ACCESSORS = Object.freeze({
    array_length: "len"
});

type LoopLengthAccessorCall = Readonly<{
    functionName: string;
    callStart: number;
    callEnd: number;
    callText: string;
}>;

type ForStatementContainerContext = Readonly<{
    forNode: AstNodeWithType;
    canInsertHoistBeforeLoop: boolean;
}>;

function resolveSafeLocFromIndex(
    context: Rule.RuleContext,
    sourceText: string,
    index: number
): { line: number; column: number } {
    const clampedIndex = Math.max(0, Math.min(index, sourceText.length));
    const sourceCodeWithLocator = context.sourceCode as Rule.RuleContext["sourceCode"] & {
        getLocFromIndex?: (offset: number) => { line: number; column: number } | undefined;
    };
    const located =
        typeof sourceCodeWithLocator.getLocFromIndex === "function"
            ? sourceCodeWithLocator.getLocFromIndex(clampedIndex)
            : undefined;
    if (
        located &&
        typeof located.line === "number" &&
        typeof located.column === "number" &&
        Number.isFinite(located.line) &&
        Number.isFinite(located.column)
    ) {
        return located;
    }

    let line = 1;
    let lastLineStart = 0;
    for (let cursor = 0; cursor < clampedIndex; cursor += 1) {
        if (sourceText[cursor] === "\n") {
            line += 1;
            lastLineStart = cursor + 1;
        }
    }

    return {
        line,
        column: clampedIndex - lastLineStart
    };
}

function resolveLoopLengthHoistSuffixMap(
    functionSuffixOverrides: Record<string, string | null> | undefined
): ReadonlyMap<string, string> {
    const suffixMap = new Map<string, string>(Object.entries(DEFAULT_HOIST_ACCESSORS));
    if (!functionSuffixOverrides) {
        return suffixMap;
    }

    for (const [functionName, suffix] of Object.entries(functionSuffixOverrides)) {
        if (!isIdentifier(functionName)) {
            continue;
        }

        if (suffix === null) {
            suffixMap.delete(functionName);
            continue;
        }

        if (typeof suffix !== "string" || suffix.length === 0) {
            continue;
        }

        suffixMap.set(functionName, suffix);
    }

    return suffixMap;
}

function collectLoopLengthAccessorCalls(parameters: {
    sourceText: string;
    rootNode: unknown;
    enabledFunctionNames: ReadonlySet<string>;
}): ReadonlyArray<LoopLengthAccessorCall> {
    const collectedCalls: Array<LoopLengthAccessorCall> = [];
    walkAstNodes(parameters.rootNode, (node) => {
        if (!isAstNodeRecord(node) || node.type !== "CallExpression") {
            return;
        }

        const callTarget = isAstNodeRecord(node.object) ? node.object : null;
        if (
            !callTarget ||
            callTarget.type !== "Identifier" ||
            typeof callTarget.name !== "string" ||
            !parameters.enabledFunctionNames.has(callTarget.name)
        ) {
            return;
        }

        const start = getNodeStartIndex(node);
        const end = getNodeEndIndex(node);
        if (typeof start !== "number" || typeof end !== "number") {
            return;
        }

        collectedCalls.push(
            Object.freeze({
                functionName: callTarget.name,
                callStart: start,
                callEnd: end,
                callText: parameters.sourceText.slice(start, end)
            })
        );
    });

    return collectedCalls;
}

function collectLoopLengthAccessorCallsFromTestExpression(parameters: {
    testNode: unknown;
    enabledFunctionNames: ReadonlySet<string>;
}): ReadonlyArray<LoopLengthAccessorCall> {
    return collectLoopLengthAccessorCalls({
        sourceText: "",
        rootNode: parameters.testNode,
        enabledFunctionNames: parameters.enabledFunctionNames
    }).map((call) =>
        Object.freeze({
            functionName: call.functionName,
            callStart: call.callStart,
            callEnd: call.callEnd,
            callText: call.callText
        })
    );
}

function collectForStatementContainerContexts(programNode: unknown): ReadonlyArray<ForStatementContainerContext> {
    const contexts: Array<ForStatementContainerContext> = [];

    walkAstNodesWithParent(programNode, (visitContext) => {
        const { node, parent, parentKey } = visitContext;
        if (node.type !== "ForStatement") {
            return;
        }

        const canInsertHoistBeforeLoop =
            parent !== null && parentKey === "body" && (parent.type === "Program" || parent.type === "BlockStatement");

        contexts.push(
            Object.freeze({
                forNode: node,
                canInsertHoistBeforeLoop
            })
        );
    });

    return contexts;
}

export function createPreferHoistableLoopAccessorsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const options = readObjectOption(context);
            const minOccurrences = typeof options.minOccurrences === "number" ? options.minOccurrences : 2;
            const functionSuffixes = options.functionSuffixes as Record<string, string | null> | undefined;
            const shouldReportUnsafeFixes = shouldReportUnsafe(context);
            const suffixMap = resolveLoopLengthHoistSuffixMap(functionSuffixes);

            return Object.freeze({
                Program(programNode) {
                    const sourceText = context.sourceCode.text;
                    const loopNodes: Array<AstNodeWithType> = [];
                    walkAstNodes(programNode, (node) => {
                        if (!isAstNodeWithType(node)) {
                            return;
                        }

                        if (
                            node.type === "ForStatement" ||
                            node.type === "WhileStatement" ||
                            node.type === "RepeatStatement" ||
                            node.type === "DoUntilStatement"
                        ) {
                            loopNodes.push(node);
                        }
                    });
                    const forStatementContexts = collectForStatementContainerContexts(programNode);
                    const forStatementContextByNode = new Map<AstNodeWithType, ForStatementContainerContext>(
                        forStatementContexts.map((loopContext) => [loopContext.forNode, loopContext])
                    );
                    const enabledHoistFunctionNames = new Set(suffixMap.keys());

                    let firstReportOffset: number | null = null;
                    let firstUnsafeOffset: number | null = null;
                    for (const loopNode of loopNodes) {
                        if (loopNode.type === "ForStatement" && enabledHoistFunctionNames.size > 0) {
                            const testCalls = collectLoopLengthAccessorCallsFromTestExpression({
                                testNode: (loopNode as any).test,
                                enabledFunctionNames: enabledHoistFunctionNames
                            });

                            if (testCalls.length > 0) {
                                const firstTestCallOffset = testCalls[0]?.callStart;
                                if (
                                    typeof firstTestCallOffset === "number" &&
                                    (firstReportOffset === null || firstTestCallOffset < firstReportOffset)
                                ) {
                                    firstReportOffset = firstTestCallOffset;
                                }

                                const forContext = forStatementContextByNode.get(loopNode);
                                if (forContext && !forContext.canInsertHoistBeforeLoop) {
                                    const forStart = getNodeStartIndex(loopNode);
                                    if (
                                        typeof forStart === "number" &&
                                        (firstUnsafeOffset === null || forStart < firstUnsafeOffset)
                                    ) {
                                        firstUnsafeOffset = forStart;
                                    }
                                }

                                continue;
                            }
                        }

                        const loopCalls = collectLoopLengthAccessorCalls({
                            sourceText,
                            rootNode: loopNode,
                            enabledFunctionNames: enabledHoistFunctionNames
                        });
                        if (loopCalls.length === 0) {
                            continue;
                        }

                        if (loopNode.type === "ForStatement") {
                            const testCalls = collectLoopLengthAccessorCalls({
                                sourceText,
                                rootNode: (loopNode as any).test,
                                enabledFunctionNames: enabledHoistFunctionNames
                            });
                            if (testCalls.length > 0) {
                                continue;
                            }
                        }

                        const groupedByAccessor = new Map<string, { count: number; firstOffset: number }>();
                        for (const call of loopCalls) {
                            const existing = groupedByAccessor.get(call.callText);
                            if (existing) {
                                existing.count += 1;
                                continue;
                            }

                            groupedByAccessor.set(call.callText, {
                                count: 1,
                                firstOffset: call.callStart
                            });
                        }

                        for (const group of groupedByAccessor.values()) {
                            if (group.count < minOccurrences) {
                                continue;
                            }

                            if (firstReportOffset === null || group.firstOffset < firstReportOffset) {
                                firstReportOffset = group.firstOffset;
                            }
                        }
                    }

                    if (firstReportOffset !== null) {
                        context.report({
                            loc: resolveSafeLocFromIndex(context, sourceText, firstReportOffset),
                            messageId: definition.messageId
                        });
                    }

                    if (firstUnsafeOffset !== null && shouldReportUnsafeFixes) {
                        context.report({
                            loc: resolveSafeLocFromIndex(context, sourceText, firstUnsafeOffset),
                            messageId: "unsafeFix"
                        });
                    }
                }
            });
        }
    });
}
