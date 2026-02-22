import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { resolveProjectContextForRule } from "../../project-context.js";
import {
    type AstNodeWithType,
    collectIdentifierNamesInProgram,
    createMeta,
    getLineIndentationAtOffset,
    getNodeStartIndex,
    isAstNodeRecord,
    type SourceTextEdit,
    walkAstNodes,
    walkAstNodesWithParent
} from "../rule-base-helpers.js";
import { dominantLineEnding, isIdentifier, readObjectOption, shouldReportUnsafe } from "../rule-helpers.js";

const DEFAULT_HOIST_ACCESSORS = Object.freeze({
    array_length: "len"
});

type LoopLengthAccessorCall = Readonly<{
    functionName: string;
    node: AstNodeWithType;
    callStart: number;
    callEnd: number;
    callText: string;
}>;

type LoopLengthHoistRewrite = Readonly<{
    insertionOffset: number;
    insertionText: string;
    callRewrites: ReadonlyArray<SourceTextEdit>;
    reportOffset: number;
}>;

type ForStatementContainerContext = Readonly<{
    forNode: AstNodeWithType;
    canInsertHoistBeforeLoop: boolean;
}>;

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

function collectLoopLengthAccessorCallsFromTestExpression(parameters: {
    sourceText: string;
    testNode: unknown;
    enabledFunctionNames: ReadonlySet<string>;
}): ReadonlyArray<LoopLengthAccessorCall> {
    const collectedCalls: Array<LoopLengthAccessorCall> = [];
    walkAstNodes(parameters.testNode, (node) => {
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

        const start = CoreWorkspace.Core.getNodeStartIndex(node);
        const end = CoreWorkspace.Core.getNodeEndIndex(node);
        if (typeof start !== "number" || typeof end !== "number") {
            return;
        }

        collectedCalls.push(
            Object.freeze({
                functionName: callTarget.name,
                node: node as AstNodeWithType,
                callStart: start,
                callEnd: end,
                callText: parameters.sourceText.slice(start, end)
            })
        );
    });

    return collectedCalls;
}

function createLoopLengthHoistRewrite(parameters: {
    sourceText: string;
    loopContext: ForStatementContainerContext;
    suffixMap: ReadonlyMap<string, string>;
    resolveHoistName: (preferredName: string, inScopeIdentifierNames: ReadonlySet<string>) => string | null;
    localIdentifierNames: ReadonlySet<string>;
    lineEnding: string;
}): LoopLengthHoistRewrite | null {
    const { forNode, canInsertHoistBeforeLoop } = parameters.loopContext;
    if (!canInsertHoistBeforeLoop) {
        return null;
    }

    const testNode = (forNode as any).test;
    const accessorCalls = collectLoopLengthAccessorCallsFromTestExpression({
        sourceText: parameters.sourceText,
        testNode,
        enabledFunctionNames: new Set(parameters.suffixMap.keys())
    });

    if (accessorCalls.length === 0) {
        return null;
    }

    const firstCall = accessorCalls[0];
    const preferredSuffix = parameters.suffixMap.get(firstCall.functionName) ?? "len";
    const hoistedName = parameters.resolveHoistName(preferredSuffix, parameters.localIdentifierNames);
    if (!hoistedName) {
        return null;
    }

    const indentation = getLineIndentationAtOffset(parameters.sourceText, getNodeStartIndex(forNode) ?? 0);
    const insertionText = `var ${hoistedName} = ${firstCall.callText};${parameters.lineEnding}${indentation}`;
    const insertionOffset = getNodeStartIndex(forNode) ?? 0;

    const callRewrites = accessorCalls.map((call) =>
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

export function createPreferLoopLengthHoistRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const options = readObjectOption(context);
            const functionSuffixes = options.functionSuffixes as Record<string, string | null> | undefined;
            const shouldReportUnsafeFixes = shouldReportUnsafe(context);
            const suffixMap = resolveLoopLengthHoistSuffixMap(functionSuffixes);

            return Object.freeze({
                Program(programNode) {
                    if (suffixMap.size === 0) {
                        return;
                    }

                    const text = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(text);
                    const projectContextResolution = resolveProjectContextForRule(context, definition);
                    if (!projectContextResolution.available || !projectContextResolution.context) {
                        return;
                    }

                    const localIdentifierNames = collectIdentifierNamesInProgram(programNode);
                    const loopContexts = collectForStatementContainerContexts(programNode);

                    const resolveHoistName = (
                        preferredName: string,
                        inScopeIdentifierNames: ReadonlySet<string>
                    ): string | null =>
                        projectContextResolution.context.resolveLoopHoistIdentifier(
                            preferredName,
                            inScopeIdentifierNames
                        );

                    let firstUnsafeOffset: number | null = null;

                    for (const loopContext of loopContexts) {
                        const rewrite = createLoopLengthHoistRewrite({
                            sourceText: text,
                            loopContext,
                            suffixMap,
                            resolveHoistName,
                            localIdentifierNames,
                            lineEnding
                        });

                        if (!rewrite) {
                            const forStart = getNodeStartIndex(loopContext.forNode);
                            if (typeof forStart !== "number") {
                                continue;
                            }

                            const hasAccessorCallInTest =
                                collectLoopLengthAccessorCallsFromTestExpression({
                                    sourceText: text,
                                    testNode: (loopContext.forNode as any).test,
                                    enabledFunctionNames: new Set(suffixMap.keys())
                                }).length > 0;
                            if (!hasAccessorCallInTest) {
                                continue;
                            }

                            if (firstUnsafeOffset === null || forStart < firstUnsafeOffset) {
                                firstUnsafeOffset = forStart;
                            }
                            continue;
                        }

                        context.report({
                            loc: context.sourceCode.getLocFromIndex(rewrite.reportOffset),
                            messageId: definition.messageId,
                            fix: (fixer) => [
                                fixer.insertTextAfterRange(
                                    [rewrite.insertionOffset, rewrite.insertionOffset],
                                    rewrite.insertionText
                                ),
                                ...rewrite.callRewrites.map((callRewrite) =>
                                    fixer.replaceTextRange([callRewrite.start, callRewrite.end], callRewrite.text)
                                )
                            ]
                        });
                    }

                    if (firstUnsafeOffset !== null && shouldReportUnsafeFixes) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(firstUnsafeOffset),
                            messageId: "unsafeFix"
                        });
                    }
                }
            });
        }
    });
}
