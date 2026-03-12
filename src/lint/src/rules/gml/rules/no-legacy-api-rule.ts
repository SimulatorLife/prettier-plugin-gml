import * as CoreWorkspace from "@gmloop/core";
import type { Rule } from "eslint";

import { getDeprecatedIdentifierCatalogEntry } from "../../../services/deprecated-identifiers/index.js";
import type { GmlRuleDefinition } from "../../catalog.js";
import {
    createMeta,
    getNodeEndIndex,
    getNodeStartIndex,
    isAstNodeWithType,
    walkAstNodesWithParent
} from "../rule-base-helpers.js";

const { Core } = CoreWorkspace;

type AstNodeWithType = Readonly<{ type: string }>;

function isRuleOwnedCatalogEntry(
    entry: ReturnType<typeof getDeprecatedIdentifierCatalogEntry>
): entry is NonNullable<ReturnType<typeof getDeprecatedIdentifierCatalogEntry>> {
    return entry !== null && entry.diagnosticOwner !== "feather";
}

function canFixCatalogEntry(entry: NonNullable<ReturnType<typeof getDeprecatedIdentifierCatalogEntry>>): boolean {
    return entry.replacementKind === "direct-rename" && entry.replacement !== null;
}

function collectLocallyDeclaredIdentifiers(programNode: unknown): ReadonlySet<string> {
    const declaredIdentifiers = new Set<string>();

    walkAstNodesWithParent(programNode, ({ node }) => {
        if (!isAstNodeWithType(node)) {
            return;
        }

        if (node.type === "VariableDeclarator") {
            const identifierName = Core.getIdentifierName((node as Readonly<{ id?: unknown }>).id as never);
            if (identifierName) {
                declaredIdentifiers.add(identifierName.toLowerCase());
            }
            return;
        }

        if (node.type === "FunctionDeclaration" || node.type === "ConstructorDeclaration") {
            const functionName = (node as Readonly<{ id?: unknown }>).id;
            if (typeof functionName === "string" && functionName.length > 0) {
                declaredIdentifiers.add(functionName.toLowerCase());
            }

            const params = (node as Readonly<{ params?: ReadonlyArray<unknown> }>).params;
            for (const parameter of params ?? []) {
                const parameterName =
                    Core.getIdentifierName(parameter as never) ??
                    Core.getIdentifierName((parameter as Readonly<{ left?: unknown }>).left as never);
                if (parameterName) {
                    declaredIdentifiers.add(parameterName.toLowerCase());
                }
            }
            return;
        }

        if (node.type === "EnumDeclaration") {
            const enumName = Core.getIdentifierName((node as Readonly<{ name?: unknown }>).name as never);
            if (enumName) {
                declaredIdentifiers.add(enumName.toLowerCase());
            }
        }
    });

    return declaredIdentifiers;
}

function isBareIdentifierDeclarationContext(parent: AstNodeWithType | null, parentKey: string | null): boolean {
    if (!parent || !parentKey) {
        return false;
    }

    if (parentKey === "params") {
        return true;
    }

    switch (parent.type) {
        case "CallExpression": {
            return parentKey === "object";
        }
        case "MemberDotExpression": {
            return parentKey === "property";
        }
        case "MemberIndexExpression": {
            return parentKey === "object" || parentKey === "property";
        }
        case "VariableDeclarator":
        case "FunctionDeclaration":
        case "ConstructorDeclaration":
        case "ConstructorParentClause":
        case "EnumDeclaration": {
            return parentKey === "id" || parentKey === "name";
        }
        default: {
            return false;
        }
    }
}

function buildReplacementSuffix(entry: NonNullable<ReturnType<typeof getDeprecatedIdentifierCatalogEntry>>): string {
    return canFixCatalogEntry(entry) ? `; use '${entry.replacement}' instead` : "";
}

function reportIdentifierRange(
    context: Rule.RuleContext,
    definition: GmlRuleDefinition,
    node: unknown,
    identifierName: string,
    entry: NonNullable<ReturnType<typeof getDeprecatedIdentifierCatalogEntry>>
): void {
    const start = getNodeStartIndex(node);
    const end = getNodeEndIndex(node);
    if (typeof start !== "number" || typeof end !== "number") {
        return;
    }

    context.report({
        node: node as Rule.Node,
        messageId: definition.messageId,
        data: {
            identifier: identifierName,
            replacementSuffix: buildReplacementSuffix(entry)
        },
        fix: canFixCatalogEntry(entry) ? (fixer) => fixer.replaceTextRange([start, end], entry.replacement) : undefined
    });
}

export function createNoLegacyApiRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition, {
            messageText: "Legacy built-in '{{identifier}}' is deprecated{{replacementSuffix}}."
        }),
        create(context) {
            return Object.freeze({
                Program(programNode) {
                    const locallyDeclaredIdentifiers = collectLocallyDeclaredIdentifiers(programNode);

                    walkAstNodesWithParent(programNode, ({ node, parent, parentKey }) => {
                        if (!isAstNodeWithType(node)) {
                            return;
                        }

                        if (node.type === "CallExpression") {
                            const callee = Core.getCallExpressionIdentifier(node as never);
                            const identifierName = callee?.name;
                            if (typeof identifierName !== "string") {
                                return;
                            }
                            if (locallyDeclaredIdentifiers.has(identifierName.toLowerCase())) {
                                return;
                            }

                            const entry = getDeprecatedIdentifierCatalogEntry(identifierName);
                            if (
                                !isRuleOwnedCatalogEntry(entry) ||
                                (entry.legacyUsage !== "call" && entry.legacyUsage !== "call-or-identifier")
                            ) {
                                return;
                            }

                            reportIdentifierRange(context, definition, callee, identifierName, entry);
                            return;
                        }

                        if (node.type === "MemberIndexExpression") {
                            const objectNode = (node as Readonly<{ object?: unknown }>).object;
                            const identifierName = Core.getIdentifierName(objectNode as never);
                            if (typeof identifierName !== "string") {
                                return;
                            }
                            if (locallyDeclaredIdentifiers.has(identifierName.toLowerCase())) {
                                return;
                            }

                            const entry = getDeprecatedIdentifierCatalogEntry(identifierName);
                            if (!isRuleOwnedCatalogEntry(entry) || entry.legacyUsage !== "indexed-identifier") {
                                return;
                            }

                            reportIdentifierRange(context, definition, objectNode, identifierName, entry);
                            return;
                        }

                        if (node.type !== "Identifier") {
                            return;
                        }

                        if (isBareIdentifierDeclarationContext(parent, parentKey)) {
                            return;
                        }

                        const identifierName = Core.getIdentifierName(node as never);
                        if (!identifierName) {
                            return;
                        }
                        if (locallyDeclaredIdentifiers.has(identifierName.toLowerCase())) {
                            return;
                        }

                        const entry = getDeprecatedIdentifierCatalogEntry(identifierName);
                        if (!isRuleOwnedCatalogEntry(entry) || entry.legacyUsage !== "identifier") {
                            return;
                        }

                        reportIdentifierRange(context, definition, node, identifierName, entry);
                    });
                }
            });
        }
    });
}
