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

function createFullTextRewriteRule(
    entry: FeatherManifestEntry,
    rewriteSourceText: (sourceText: string) => string
): Rule.RuleModule {
    return Object.freeze({
        meta: createFeatherRuleMeta(entry),
        create(context) {
            return Object.freeze({
                Program() {
                    const sourceText = context.sourceCode.text;
                    const rewritten = rewriteSourceText(sourceText);
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

function createGm1000Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => sourceText.replaceAll(/^\s*break;\s*\n?/gm, ""));
}

function createGm1002Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(/global\.(\w+)\s*=/g, (_fullMatch, identifier: string) => `${identifier} =`)
    );
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
                                /^(?<name>[A-Za-z_][A-Za-z0-9_]*)(?<initializer>\s*=\s*[^,\n]+)?(?<suffix>\s*(?:,\s*)?(?:\/\/.*)?)$/u.exec(
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

function createGm1007Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        const filtered = sourceText
            .split(/\r?\n/u)
            .filter((line) => {
                const trimmed = line.trim();
                if (trimmed.length === 0) {
                    return true;
                }

                if (/^new\s+\w+\([^)]*\)\s*=/.test(trimmed)) {
                    return false;
                }
                if (/^\d+\s*=/.test(trimmed)) {
                    return false;
                }
                if (/^=\s*/.test(trimmed)) {
                    return false;
                }
                return true;
            })
            .join("\n");
        return filtered;
    });
}

function createGm1008Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        const declaredWorkingDirectory = /(?:^|\n)\s*working_directory\s*=/.test(sourceText);
        if (!declaredWorkingDirectory) {
            return sourceText;
        }

        return sourceText.replaceAll(/\bworking_directory\b/g, "__feather_working_directory");
    });
}

function createGm1009Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replaceAll(/\bfa_readonly\s*\+\s*fa_archive\b/g, "fa_readonly | fa_archive");
        rewritten = rewritten.replaceAll(/\broom\s*\+\s*1\b/g, "room_next(room)");
        rewritten = rewritten.replaceAll(/\broom\s*-\s*1\b/g, "room_previous(room)");
        rewritten = rewritten.replaceAll(/\broom_goto\(\s*room_next\(room\)\s*\)/g, "room_goto_next()");
        rewritten = rewritten.replaceAll(/\broom_goto\(\s*room\s*\+\s*1\s*\)/g, "room_goto_next()");
        return rewritten;
    });
}

function createGm1010Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replaceAll(/(?<=\b\d+\s*\+\s*)"(-?\d+(?:\.\d+)?)"/g, "$1");
        rewritten = rewritten.replaceAll(/(?<==\s*)"(-?\d+(?:\.\d+)?)"\s*(?=\+\s*[A-Za-z_]\w*)/g, "$1");
        rewritten = rewritten.replaceAll(/\+\s*([A-Za-z_]\w*)\b/g, (fullMatch, identifier: string) => {
            if (!/num/i.test(identifier)) {
                return fullMatch;
            }

            return `+ real(${identifier})`;
        });
        return rewritten;
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

function createGm1015Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replaceAll(/(\b[A-Za-z_]\w*\s*=\s*[^;\n/]+)\s*\/\s*0\b/g, "$1");
        rewritten = rewritten.replaceAll(/^\s*\w+\s*\/=\s*0\s*;\s*\n?/gm, "");
        rewritten = rewritten.replaceAll(/%=\s*\(\s*-?0\s*\)/g, "%= -1");
        return rewritten;
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

function createGm1024Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        const declarationMatch = /(^|\n)(\s*)score\s*=/.exec(sourceText);
        if (!declarationMatch) {
            return sourceText;
        }

        return sourceText.replaceAll(/\bscore\b/g, "__featherFix_score");
    });
}

function createGm1026Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        const linePattern = /^(\s*)pi\+\+;\s*$/m;
        const match = linePattern.exec(sourceText);
        if (!match) {
            return sourceText;
        }

        const indentation = match[1];
        return sourceText.replace(linePattern, `${indentation}var __featherFix_pi = pi;\n${indentation}__featherFix_pi++;`);
    });
}

function createGm1028Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => sourceText.replaceAll(/\blst_\w*\[\?\s*/g, (prefix) => prefix.replace("[?", "[|")));
}

function createGm1029Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(/"(-?\d+(?:\.\d+)?)"/g, (_fullMatch, numeric: string) => numeric)
    );
}

function createGm1030Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        const declarationPattern = /\bvar\s+sprite_index\b/;
        if (!declarationPattern.test(sourceText)) {
            return sourceText;
        }

        return sourceText.replaceAll(/\bsprite_index\b/g, "__featherFix_sprite_index");
    });
}

function createGm1033Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => sourceText.replaceAll(/;{2,}/g, ";"));
}

function createGm1038Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        const lines = sourceText.split(/\r?\n/u);
        const seenMacros = new Set<string>();
        const rewritten: Array<string> = [];
        for (const line of lines) {
            const macroMatch = /^\s*#macro\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line);
            if (!macroMatch) {
                rewritten.push(line);
                continue;
            }

            const macroName = macroMatch[1];
            if (seenMacros.has(macroName)) {
                continue;
            }

            seenMacros.add(macroName);
            rewritten.push(line);
        }

        return rewritten.join("\n");
    });
}

function createGm1041Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(
            /\b(instance_create_(?:depth|layer)\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*)"([A-Za-z_][A-Za-z0-9_]*)"\s*\)/g,
            (_fullMatch, prefix: string, objectName: string) => `${prefix}${objectName})`
        )
    );
}

function createGm1051Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        const lines = sourceText.split(/\r?\n/u);
        return lines
            .map((line) => {
                if (!/^\s*#macro\b/.test(line)) {
                    return line;
                }

                const inlineCommentStart = line.search(/\/\/|\/\*/);
                const body = inlineCommentStart === -1 ? line : line.slice(0, inlineCommentStart);
                const comment = inlineCommentStart === -1 ? "" : line.slice(inlineCommentStart);
                const sanitizedBody = body.replace(/;\s*$/, "");
                if (/\w;\w/.test(sanitizedBody)) {
                    return line;
                }
                return `${sanitizedBody}${comment}`;
            })
            .join("\n");
    });
}

function createGm1052Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(/\bdelete\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g, (_fullMatch, identifier: string) => {
            return `${identifier} = undefined;`;
        })
    );
}

function createGm1058Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        const constructorCalls = new Set<string>();
        for (const match of sourceText.matchAll(/\bnew\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
            constructorCalls.add(match[1]);
        }

        if (constructorCalls.size === 0) {
            return sourceText;
        }

        let rewritten = sourceText;
        for (const functionName of constructorCalls) {
            const declarationPattern = new RegExp(`\\bfunction\\s+${functionName}\\s*\\([^)]*\\)\\s*(?!constructor\\b)`, "g");
            rewritten = rewritten.replaceAll(declarationPattern, (declaration) => `${declaration} constructor`);
        }

        return rewritten;
    });
}

function createGm1063Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(
            /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(\s*texture_defined\s*\)\s*\?\s*([^:;]+)\s*:\s*-1\s*;/g,
            (_fullMatch, identifier: string, truthyExpr: string) => `${identifier} = texture_defined ? ${truthyExpr.trim()} : pointer_null;`
        )
    );
}

function createGm1064Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        const seenFunctionNames = new Set<string>();
        const functionPattern = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g;
        const removals: Array<[number, number]> = [];

        for (const match of sourceText.matchAll(functionPattern)) {
            const functionName = match[1];
            const start = match.index ?? 0;
            const openBraceIndex = sourceText.indexOf("{", start);
            if (openBraceIndex === -1) {
                continue;
            }

            let depth = 1;
            let end = openBraceIndex + 1;
            while (end < sourceText.length && depth > 0) {
                const character = sourceText[end];
                if (character === "{") {
                    depth += 1;
                } else if (character === "}") {
                    depth -= 1;
                }
                end += 1;
            }

            if (!seenFunctionNames.has(functionName)) {
                seenFunctionNames.add(functionName);
                continue;
            }

            let removalEnd = end;
            while (removalEnd < sourceText.length && /\s/.test(sourceText[removalEnd])) {
                removalEnd += 1;
            }
            removals.push([start, removalEnd]);
        }

        if (removals.length === 0) {
            return sourceText;
        }

        let rewritten = "";
        let cursor = 0;
        for (const [start, end] of removals) {
            rewritten += sourceText.slice(cursor, start);
            cursor = end;
        }
        rewritten += sourceText.slice(cursor);
        return rewritten;
    });
}

export function createFeatherRule(entry: FeatherManifestEntry): Rule.RuleModule {
    if (entry.id === "GM1000") {
        return createGm1000Rule(entry);
    }

    if (entry.id === "GM1002") {
        return createGm1002Rule(entry);
    }

    if (entry.id === "GM1003") {
        return createGm1003Rule(entry);
    }

    if (entry.id === "GM1004") {
        return createGm1004Rule(entry);
    }

    if (entry.id === "GM1005") {
        return createGm1005Rule(entry);
    }

    if (entry.id === "GM1007") {
        return createGm1007Rule(entry);
    }

    if (entry.id === "GM1008") {
        return createGm1008Rule(entry);
    }

    if (entry.id === "GM1009") {
        return createGm1009Rule(entry);
    }

    if (entry.id === "GM1010") {
        return createGm1010Rule(entry);
    }

    if (entry.id === "GM1014") {
        return createGm1014Rule(entry);
    }

    if (entry.id === "GM1015") {
        return createGm1015Rule(entry);
    }

    if (entry.id === "GM1016") {
        return createGm1016Rule(entry);
    }

    if (entry.id === "GM1023") {
        return createGm1023Rule(entry);
    }

    if (entry.id === "GM1024") {
        return createGm1024Rule(entry);
    }

    if (entry.id === "GM1026") {
        return createGm1026Rule(entry);
    }

    if (entry.id === "GM1028") {
        return createGm1028Rule(entry);
    }

    if (entry.id === "GM1029") {
        return createGm1029Rule(entry);
    }

    if (entry.id === "GM1030") {
        return createGm1030Rule(entry);
    }

    if (entry.id === "GM1033") {
        return createGm1033Rule(entry);
    }

    if (entry.id === "GM1038") {
        return createGm1038Rule(entry);
    }

    if (entry.id === "GM1041") {
        return createGm1041Rule(entry);
    }

    if (entry.id === "GM1051") {
        return createGm1051Rule(entry);
    }

    if (entry.id === "GM1052") {
        return createGm1052Rule(entry);
    }

    if (entry.id === "GM1058") {
        return createGm1058Rule(entry);
    }

    if (entry.id === "GM1063") {
        return createGm1063Rule(entry);
    }

    if (entry.id === "GM1064") {
        return createGm1064Rule(entry);
    }

    return Object.freeze({
        meta: createFeatherRuleMeta(entry),
        create(context: Rule.RuleContext) {
            void context;
            return Object.freeze({});
        }
    });
}
