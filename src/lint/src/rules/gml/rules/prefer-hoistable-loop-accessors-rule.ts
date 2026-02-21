import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import {
    type AstNodeWithType,
    createMeta,
    getNodeEndIndex,
    getNodeStartIndex,
    isAstNodeRecord,
    isAstNodeWithType,
    walkAstNodes} from "../rule-base-helpers.js";
import { readObjectOption } from "../rule-helpers.js";

type LoopLengthAccessorCall = Readonly<{
    functionName: string;
    callStart: number;
    callEnd: number;
    callText: string;
}>;

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

export function createPreferHoistableLoopAccessorsRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const options = readObjectOption(context);
            const minOccurrences = typeof options.minOccurrences === "number" ? options.minOccurrences : 2;

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

                    let firstReportOffset: number | null = null;
                    for (const loopNode of loopNodes) {
                        const loopCalls = collectLoopLengthAccessorCalls({
                            sourceText,
                            rootNode: loopNode,
                            enabledFunctionNames: new Set(["array_length"])
                        });
                        if (loopCalls.length === 0) {
                            continue;
                        }

                        if (loopNode.type === "ForStatement") {
                            const testCalls = collectLoopLengthAccessorCalls({
                                sourceText,
                                rootNode: (loopNode as any).test,
                                enabledFunctionNames: new Set(["array_length"])
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
                            loc: context.sourceCode.getLocFromIndex(firstReportOffset),
                            messageId: definition.messageId
                        });
                    }
                }
            });
        }
    });
}
