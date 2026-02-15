import type { Rule } from "eslint";

import type { FeatherManifestEntry } from "./manifest.js";

type EnumBlockMatch = {
    start: number;
    end: number;
    text: string;
};

type EnumDeclarationMatch = {
    name: string;
    start: number;
    end: number;
    text: string;
};

function createFeatherRuleMeta(entry: FeatherManifestEntry): Rule.RuleMetaData {
    return Object.freeze({
        type: "suggestion",
        docs: Object.freeze({
            description: `Rule for ${entry.ruleId}.`,
            recommended: false,
            requiresProjectContext: entry.requiresProjectContext
        }),
        schema: Object.freeze([]),
        messages: Object.freeze({
            diagnostic: `${entry.ruleId} diagnostic.`
        })
    });
}

function findEnumBlocks(text: string): Array<EnumBlockMatch> {
    const blocks: Array<EnumBlockMatch> = [];
    const enumPattern = /enum\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/g;
    let match = enumPattern.exec(text);
    while (match) {
        const blockStart = match.index;
        const openBraceIndex = text.indexOf("{", blockStart);
        if (openBraceIndex === -1) {
            match = enumPattern.exec(text);
            continue;
        }

        let depth = 0;
        let blockEnd = -1;
        for (let index = openBraceIndex; index < text.length; index += 1) {
            const character = text[index];
            if (character === "{") {
                depth += 1;
                continue;
            }

            if (character === "}") {
                depth -= 1;
                if (depth === 0) {
                    blockEnd = index + 1;
                    break;
                }
            }
        }

        if (blockEnd > blockStart) {
            blocks.push({
                start: blockStart,
                end: blockEnd,
                text: text.slice(blockStart, blockEnd)
            });
        }

        match = enumPattern.exec(text);
    }

    return blocks;
}

function findEnumDeclarations(text: string): Array<EnumDeclarationMatch> {
    const declarations: Array<EnumDeclarationMatch> = [];
    const enumPattern = /enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;
    let match = enumPattern.exec(text);
    while (match) {
        const declarationStart = match.index ?? 0;
        const enumName = match[1];
        const openBraceIndex = text.indexOf("{", declarationStart);
        if (openBraceIndex === -1) {
            match = enumPattern.exec(text);
            continue;
        }

        let depth = 0;
        let declarationEnd = -1;
        for (let index = openBraceIndex; index < text.length; index += 1) {
            const character = text[index];
            if (character === "{") {
                depth += 1;
                continue;
            }

            if (character === "}") {
                depth -= 1;
                if (depth === 0) {
                    declarationEnd = index + 1;
                    break;
                }
            }
        }

        if (declarationEnd > declarationStart) {
            declarations.push({
                name: enumName,
                start: declarationStart,
                end: declarationEnd,
                text: text.slice(declarationStart, declarationEnd)
            });
        }

        match = enumPattern.exec(text);
    }

    return declarations;
}

function createGm1003Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return Object.freeze({
        meta: createFeatherRuleMeta(entry),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const enumBlocks = findEnumBlocks(sourceText);
                    for (const block of enumBlocks) {
                        const rewritten = block.text.replaceAll(
                            /=\s*"(?<integer>-?\d+)"(?<suffix>\s*(?:,|\/\/|$))/gm,
                            (_full, integer, suffix) => `= ${integer}${suffix as string}`
                        );
                        if (rewritten === block.text) {
                            continue;
                        }

                        context.report({
                            loc: context.sourceCode.getLocFromIndex(block.start),
                            messageId: "diagnostic",
                            fix: (fixer) => fixer.replaceTextRange([block.start, block.end], rewritten)
                        });
                    }
                }
            });
        }
    });
}

function createGm1004Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return Object.freeze({
        meta: createFeatherRuleMeta(entry),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const enumBlocks = findEnumBlocks(sourceText);
                    for (const block of enumBlocks) {
                        const lines = block.text.split(/\r?\n/u);
                        const memberEntries: Array<{ lineIndex: number; name: string; hasInitializer: boolean }> = [];
                        for (const [index, line] of lines.entries()) {
                            const trimmed = line.trim();
                            if (
                                trimmed.length === 0 ||
                                trimmed.startsWith("//") ||
                                trimmed === "{" ||
                                trimmed === "}"
                            ) {
                                continue;
                            }

                            const memberMatch =
                                /^(?<name>[A-Za-z_][A-Za-z0-9_]*)(?<initializer>\s*=\s*(?:[^\s,][^,\n]*|[\t\u000B\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]))?(?<suffix>\s*(?:,\s*)?(?:\/\/.*)?)$/u.exec(
                                    trimmed
                                );
                            if (!memberMatch?.groups?.name) {
                                continue;
                            }

                            memberEntries.push({
                                lineIndex: index,
                                name: memberMatch.groups.name,
                                hasInitializer: typeof memberMatch.groups.initializer === "string"
                            });
                        }

                        const entriesByName = new Map<string, Array<{ lineIndex: number; hasInitializer: boolean }>>();
                        for (const entryLine of memberEntries) {
                            const bucket = entriesByName.get(entryLine.name) ?? [];
                            bucket.push({
                                lineIndex: entryLine.lineIndex,
                                hasInitializer: entryLine.hasInitializer
                            });
                            entriesByName.set(entryLine.name, bucket);
                        }

                        const removeLineIndexes = new Set<number>();
                        for (const duplicateEntries of entriesByName.values()) {
                            if (duplicateEntries.length < 2) {
                                continue;
                            }

                            const initializerEntries = duplicateEntries.filter((entryLine) => entryLine.hasInitializer);
                            const keeper =
                                initializerEntries.length > 0
                                    ? (initializerEntries.at(-1) ?? duplicateEntries[0])
                                    : duplicateEntries[0];

                            for (const candidate of duplicateEntries) {
                                if (candidate.lineIndex !== keeper.lineIndex) {
                                    removeLineIndexes.add(candidate.lineIndex);
                                }
                            }
                        }

                        if (removeLineIndexes.size === 0) {
                            continue;
                        }

                        const rewrittenLines = lines.filter((_, index) => !removeLineIndexes.has(index));
                        const rewritten = rewrittenLines.join("\n");
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(block.start),
                            messageId: "diagnostic",
                            fix: (fixer) => fixer.replaceTextRange([block.start, block.end], rewritten)
                        });
                    }
                }
            });
        }
    });
}

function createGm1005Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return Object.freeze({
        meta: createFeatherRuleMeta(entry),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const pattern = /\bdraw_set_color\(\s*\)/g;
                    for (const match of sourceText.matchAll(pattern)) {
                        const start = match.index ?? 0;
                        const end = start + match[0].length;
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(start),
                            messageId: "diagnostic",
                            fix: (fixer) => fixer.replaceTextRange([start, end], "draw_set_color(c_black)")
                        });
                    }
                }
            });
        }
    });
}

function createGm1014Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return Object.freeze({
        meta: createFeatherRuleMeta(entry),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const enumDeclarations = findEnumDeclarations(sourceText);
                    const enumByName = new Map<string, EnumDeclarationMatch>();
                    for (const declaration of enumDeclarations) {
                        enumByName.set(declaration.name, declaration);
                    }

                    const enumMemberReferencePattern = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
                    for (const match of sourceText.matchAll(enumMemberReferencePattern)) {
                        const enumName = match[1];
                        const memberName = match[2];
                        const declaration = enumByName.get(enumName);
                        if (!declaration) {
                            continue;
                        }

                        const memberPattern = new RegExp(String.raw`\b${memberName}\b`, "u");
                        if (memberPattern.test(declaration.text)) {
                            continue;
                        }

                        const sizeofPattern = /^(\s*)(SIZEOF\b[^\n]*)/m;
                        const sizeofMatch = sizeofPattern.exec(declaration.text);
                        if (!sizeofMatch) {
                            continue;
                        }

                        const indentation = sizeofMatch[1];
                        const insertion = `${indentation}${memberName},\n`;
                        const blockRelativeInsertIndex = sizeofMatch.index ?? 0;
                        const absoluteInsertIndex = declaration.start + blockRelativeInsertIndex;

                        context.report({
                            loc: context.sourceCode.getLocFromIndex(absoluteInsertIndex),
                            messageId: "diagnostic",
                            fix: (fixer) =>
                                fixer.replaceTextRange(
                                    [declaration.start, declaration.end],
                                    `${declaration.text.slice(0, blockRelativeInsertIndex)}${insertion}${declaration.text.slice(blockRelativeInsertIndex)}`
                                )
                        });
                        return;
                    }
                }
            });
        }
    });
}

function createGm1016Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return Object.freeze({
        meta: createFeatherRuleMeta(entry),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const rewritten = sourceText.replaceAll(/^\s*(?:true|false)\s*;\s*/gm, "");
                    if (rewritten === sourceText) {
                        return;
                    }

                    context.report({
                        loc: context.sourceCode.getLocFromIndex(0),
                        messageId: "diagnostic",
                        fix: (fixer) => fixer.replaceTextRange([0, sourceText.length], rewritten)
                    });
                }
            });
        }
    });
}

function createGm1023Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return Object.freeze({
        meta: createFeatherRuleMeta(entry),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const legacyOsSymbolPattern = /\bos_win32\b/g;
                    for (const match of sourceText.matchAll(legacyOsSymbolPattern)) {
                        const start = match.index ?? 0;
                        const end = start + match[0].length;
                        context.report({
                            loc: context.sourceCode.getLocFromIndex(start),
                            messageId: "diagnostic",
                            fix: (fixer) => fixer.replaceTextRange([start, end], "os_windows")
                        });
                    }
                }
            });
        }
    });
}

export function createFeatherRule(entry: FeatherManifestEntry): Rule.RuleModule {
    if (entry.id === "GM1003") {
        return createGm1003Rule(entry);
    }

    if (entry.id === "GM1004") {
        return createGm1004Rule(entry);
    }

    if (entry.id === "GM1005") {
        return createGm1005Rule(entry);
    }

    if (entry.id === "GM1014") {
        return createGm1014Rule(entry);
    }

    if (entry.id === "GM1016") {
        return createGm1016Rule(entry);
    }

    if (entry.id === "GM1023") {
        return createGm1023Rule(entry);
    }

    return Object.freeze({
        meta: createFeatherRuleMeta(entry),
        create(context: Rule.RuleContext) {
            void context;
            return Object.freeze({});
        }
    });
}
