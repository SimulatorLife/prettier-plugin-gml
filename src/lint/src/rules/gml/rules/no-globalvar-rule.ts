import * as CoreWorkspace from "@gmloop/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, getNodeEndIndex, getNodeStartIndex, isAstNodeRecord } from "../rule-base-helpers.js";
import { isIdentifier } from "../rule-helpers.js";

type GlobalVarStatementRange = Readonly<{
    start: number;
    end: number;
    names: ReadonlyArray<string>;
}>;

type IdentifierReference = Readonly<{
    start: number;
    end: number;
    name: string;
}>;

function collectGlobalVarStatements(programNode: unknown): ReadonlyArray<GlobalVarStatementRange> {
    const statements: Array<GlobalVarStatementRange> = [];

    const visit = (node: unknown): void => {
        if (Array.isArray(node)) {
            for (const element of node) {
                visit(element);
            }
            return;
        }

        if (!isAstNodeRecord(node)) {
            return;
        }

        if (node.type === "GlobalVarStatement") {
            const start = getNodeStartIndex(node);
            const endExclusive = getNodeEndIndex(node);
            if (typeof start === "number" && typeof endExclusive === "number") {
                const declarations = CoreWorkspace.Core.asArray<Record<string, unknown>>(node.declarations);
                const names = declarations
                    .map((declaration) => CoreWorkspace.Core.getIdentifierText(declaration.id ?? null))
                    .filter((name): name is string => isIdentifier(name));

                if (names.length > 0) {
                    statements.push(
                        Object.freeze({
                            start,
                            end: endExclusive,
                            names
                        })
                    );
                }
            }
        }

        CoreWorkspace.Core.forEachNodeChild(node, (childNode) => visit(childNode));
    };

    visit(programNode);
    return statements;
}

/**
 * Collect all bare Identifier references (not already qualified as `global.name`) whose
 * names are in the provided set.
 */
function collectBareIdentifierReferences(
    programNode: unknown,
    globalvarNames: ReadonlySet<string>
): ReadonlyArray<IdentifierReference> {
    const refs: Array<IdentifierReference> = [];

    const visit = (node: unknown, parentNode: unknown): void => {
        if (Array.isArray(node)) {
            for (const element of node) {
                visit(element, parentNode);
            }
            return;
        }

        if (!isAstNodeRecord(node)) {
            return;
        }

        if (node.type === "Identifier") {
            const name = typeof node.name === "string" ? node.name : null;
            if (name && globalvarNames.has(name)) {
                // Skip if this identifier is the property side of `global.name`
                if (
                    isAstNodeRecord(parentNode) &&
                    parentNode.type === "MemberDotExpression" &&
                    isAstNodeRecord(parentNode.object) &&
                    parentNode.object.type === "Identifier" &&
                    typeof parentNode.object.name === "string" &&
                    parentNode.object.name === "global" &&
                    parentNode.property === node
                ) {
                    return;
                }

                // Also skip if this identifier IS the `global` prefix itself
                if (name === "global") {
                    return;
                }

                const start = getNodeStartIndex(node);
                const end = getNodeEndIndex(node);
                if (typeof start === "number" && typeof end === "number") {
                    refs.push(Object.freeze({ start, end, name }));
                }
            }
        }

        CoreWorkspace.Core.forEachNodeChild(node, (childNode) => visit(childNode, node));
    };

    visit(programNode, null);
    return refs;
}

export function createNoGlobalvarRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const listener: Rule.RuleListener = {
                Program(programNode) {
                    const globalVarStatements = collectGlobalVarStatements(programNode);
                    if (globalVarStatements.length === 0) {
                        return;
                    }

                    const allDeclaredNames = new Set<string>(globalVarStatements.flatMap((s) => [...s.names]));

                    const bareRefs = collectBareIdentifierReferences(programNode, allDeclaredNames);
                    const sourceText = context.sourceCode.text;

                    // Report each globalvar statement with a fix to remove it (including its line)
                    for (const statement of globalVarStatements) {
                        // Extend removal range to include the trailing newline if present
                        let removeEnd = statement.end;
                        if (removeEnd < sourceText.length && sourceText[removeEnd] === "\n") {
                            removeEnd += 1;
                        } else if (
                            removeEnd < sourceText.length &&
                            sourceText[removeEnd] === "\r" &&
                            removeEnd + 1 < sourceText.length &&
                            sourceText[removeEnd + 1] === "\n"
                        ) {
                            removeEnd += 2;
                        }

                        context.report({
                            loc: context.sourceCode.getLocFromIndex(statement.start),
                            messageId: definition.messageId,
                            fix(fixer) {
                                return fixer.replaceTextRange([statement.start, removeEnd], "");
                            }
                        });
                    }

                    // Report each bare identifier reference with a fix to prefix with `global.`
                    for (const ref of bareRefs) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(ref.start),
                            messageId: definition.messageId,
                            fix(fixer) {
                                return fixer.replaceTextRange([ref.start, ref.end], `global.${ref.name}`);
                            }
                        });
                    }
                }
            };

            return Object.freeze(listener);
        }
    });
}
