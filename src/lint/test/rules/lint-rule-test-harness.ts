import * as LintWorkspace from "@gml-modules/lint";

import {
    applyFixOperations,
    createLocResolver,
    type InsertTextAfterRangeFixOperation,
    readNodeTextRange,
    type ReplaceTextRangeFixOperation,
    type RuleTestFixOperation
} from "./rule-test-harness.js";

const { Lint } = LintWorkspace;

const allCapabilities = new Set(["IDENTIFIER_OCCUPANCY", "IDENTIFIER_OCCURRENCES", "LOOP_HOIST_NAME_RESOLUTION"]);

function resolveLoopHoistIdentifierForTests(
    preferredName: string,
    localIdentifierNames: ReadonlySet<string>,
    _normalizedLocalIdentifierNames: ReadonlySet<string>
): string | null {
    if (preferredName.length === 0) {
        return null;
    }

    if (!localIdentifierNames.has(preferredName)) {
        return preferredName;
    }

    for (let suffix = 1; suffix <= 1000; suffix += 1) {
        const candidate = `${preferredName}_${suffix}`;
        if (!localIdentifierNames.has(candidate)) {
            return candidate;
        }
    }

    return null;
}

function parseProgramNode(code: string): Record<string, unknown> {
    const language = Lint.plugin.languages.gml as {
        parse: (
            file: { body: string; path: string; physicalPath: string; bom: boolean },
            context: { languageOptions: { recovery: "none" | "limited" } }
        ) => { ok: true; ast: Record<string, unknown> } | { ok: false };
    };

    const parseResult = language.parse(
        {
            body: code,
            path: "test.gml",
            physicalPath: "test.gml",
            bom: false
        },
        {
            languageOptions: { recovery: "limited" }
        }
    );

    if (parseResult.ok) {
        return parseResult.ast;
    }

    return { type: "Program", body: [] };
}

/**
 * Runs a non-feather lint rule against source and applies local fixer operations.
 */
export function lintWithRule(
    ruleName: string,
    code: string,
    options: Record<string, unknown> = {}
): {
    messages: Array<{ messageId: string; loc?: { line: number; column: number }; fix?: Array<RuleTestFixOperation> }>;
    output: string;
} {
    const rule = Lint.plugin.rules[ruleName];
    const messages: Array<{
        messageId: string;
        loc?: { line: number; column: number };
        fix?: Array<RuleTestFixOperation>;
    }> = [];
    const getLocFromIndex = createLocResolver(code);

    const sourceCode = {
        text: code,
        parserServices: {
            gml: {
                filePath: "test.gml"
            }
        },
        getLocFromIndex,
        getText(node?: unknown): string {
            if (!node) {
                return code;
            }
            const range = readNodeTextRange(node);
            if (!range) {
                return "";
            }
            return code.slice(range[0], range[1]);
        },
        getLoc(node: unknown): { source: string } {
            const range = readNodeTextRange(node);
            if (!range) {
                return { source: "" };
            }
            return { source: code.slice(range[0], range[1]) };
        }
    };

    const context = {
        options: [options],
        settings: {
            gml: {
                project: {
                    getContext: () => ({
                        capabilities: allCapabilities,
                        isIdentifierNameOccupiedInProject: () => false,
                        listIdentifierOccurrenceFiles: () => new Set<string>(),
                        assessGlobalVarRewrite: () => ({ allowRewrite: true, reason: null }),
                        resolveLoopHoistIdentifier: resolveLoopHoistIdentifierForTests
                    })
                }
            }
        },
        sourceCode,
        getSourceCode() {
            return sourceCode;
        },
        report(payload: {
            messageId: string;
            node?: unknown;
            loc?: { line: number; column: number };
            fix?: (fixer: {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation;
                insertTextAfterRange(range: [number, number], text: string): InsertTextAfterRangeFixOperation;
                replaceText(node: unknown, text: string): ReplaceTextRangeFixOperation;
                insertTextAfter(node: unknown, text: string): InsertTextAfterRangeFixOperation;
            }) => RuleTestFixOperation | Array<RuleTestFixOperation> | null;
        }) {
            const fixer = {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation {
                    return { kind: "replace", range, text };
                },
                insertTextAfterRange(range: [number, number], text: string): InsertTextAfterRangeFixOperation {
                    return { kind: "insert-after", range, text };
                },
                replaceText(node: unknown, text: string): ReplaceTextRangeFixOperation {
                    const range = readNodeTextRange(node);
                    if (!range) {
                        throw new TypeError("Expected node with range for replaceText fixer.");
                    }
                    return { kind: "replace", range, text };
                },
                insertTextAfter(node: unknown, text: string): InsertTextAfterRangeFixOperation {
                    const range = readNodeTextRange(node);
                    if (!range) {
                        throw new TypeError("Expected node with range for insertTextAfter fixer.");
                    }
                    return { kind: "insert-after", range, text };
                }
            };

            let fixes: Array<RuleTestFixOperation> | undefined;
            if (payload.fix) {
                const output = payload.fix(fixer);
                fixes = output ? (Array.isArray(output) ? output : [output]) : undefined;
            }

            const nodeRange = readNodeTextRange(payload.node);
            const inferredLoc = payload.loc ?? (nodeRange ? getLocFromIndex(nodeRange[0]) : undefined);
            messages.push({ messageId: payload.messageId, loc: inferredLoc, fix: fixes });
        }
    } as never;

    const listeners = rule.create(context) as Record<string, ((node: unknown) => void) | undefined>;
    const programNode = parseProgramNode(code);

    type ParsedListenerSelector = Readonly<{
        selector: string;
        nodeType: string;
        property?: string;
        value?: string;
    }>;

    function parseListenerSelector(rawSelector: string): ReadonlyArray<ParsedListenerSelector> {
        const selectors = rawSelector
            .split(",")
            .map((selector) => selector.trim())
            .filter((selector) => selector.length > 0);
        const parsed: Array<ParsedListenerSelector> = [];
        for (const selector of selectors) {
            const predicateMatch = /^([A-Za-z_]\w*)\[(\w+)\s*=\s*['"]([^'"]+)['"]\]$/u.exec(selector);
            if (predicateMatch) {
                parsed.push({
                    selector,
                    nodeType: predicateMatch[1] ?? "",
                    property: predicateMatch[2] ?? "",
                    value: predicateMatch[3] ?? ""
                });
                continue;
            }

            const nodeTypeMatch = /^([A-Za-z_]\w*)$/u.exec(selector);
            if (nodeTypeMatch) {
                parsed.push({
                    selector,
                    nodeType: nodeTypeMatch[1] ?? ""
                });
            }
        }
        return parsed;
    }

    const selectorListeners = Object.entries(listeners).flatMap(([selector, listener]) => {
        if (!listener) {
            return [];
        }

        return parseListenerSelector(selector).map((parsedSelector) => Object.freeze({ parsedSelector, listener }));
    });

    const visitedNodes = new WeakSet<object>();
    const visitNode = (node: unknown): void => {
        if (!node || typeof node !== "object") {
            return;
        }
        if (visitedNodes.has(node)) {
            return;
        }
        visitedNodes.add(node);

        const nodeType = Reflect.get(node, "type");
        if (typeof nodeType === "string") {
            for (const { parsedSelector, listener } of selectorListeners) {
                if (parsedSelector.nodeType !== nodeType) {
                    continue;
                }

                if (parsedSelector.property && parsedSelector.value !== undefined) {
                    const actualValue = Reflect.get(node, parsedSelector.property);
                    if (actualValue !== parsedSelector.value) {
                        continue;
                    }
                }

                listener(node);
            }
        }

        const values = Object.values(node as Record<string, unknown>);
        for (const value of values) {
            if (Array.isArray(value)) {
                for (const child of value) {
                    visitNode(child);
                }
                continue;
            }
            visitNode(value);
        }
    };

    visitNode(programNode);

    return {
        messages,
        output: applyFixOperations(
            code,
            messages
                .flatMap((message) => message.fix ?? [])
                .filter((fix) => fix.kind === "replace" || fix.kind === "insert-after")
        )
    };
}
