import * as CoreWorkspace from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, getNodeEndIndex, getNodeStartIndex, isAstNodeRecord } from "../rule-base-helpers.js";
import { isIdentifier } from "../rule-helpers.js";

type GlobalVarStatementRange = Readonly<{
    start: number;
    end: number;
    names: ReadonlyArray<string>;
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

export function createNoGlobalvarRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            const listener: Rule.RuleListener = {
                Program(programNode) {
                    const globalVarStatements = collectGlobalVarStatements(programNode);

                    for (const statement of globalVarStatements) {
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(statement.start),
                            messageId: definition.messageId
                        });
                    }
                }
            };

            return Object.freeze(listener);
        }
    });
}
