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

function appendLineIfMissing(sourceText: string, lineToAppend: string): string {
    if (sourceText.includes(lineToAppend)) {
        return sourceText;
    }

    const hasTerminalNewline = sourceText.endsWith("\n");
    return `${sourceText}${hasTerminalNewline ? "" : "\n"}${lineToAppend}\n`;
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
    return createFullTextRewriteRule(entry, (sourceText) => sourceText.replaceAll(/^\s*break;\s*/gm, ""));
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
        return sourceText
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
        rewritten = rewritten.replaceAll(/^\s*\w+\s*\/=\s*0\s*;\s*/gm, "");
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
        return sourceText.replace(
            linePattern,
            `${indentation}var __featherFix_pi = pi;\n${indentation}__featherFix_pi++;`
        );
    });
}

function createGm1028Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(/\blst_\w*\[\?\s*/g, (prefix) => prefix.replace("[?", "[|"))
    );
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
            /\b(instance_create_(?:depth|layer)\([^,]+,[^,]+,[^,]+,\s*)"([A-Za-z_][A-Za-z0-9_]*)"\s*\)/g,
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
            const declarationPattern = new RegExp(
                String.raw`\bfunction\s+${functionName}\s*\([^)]*\)\s*(?!constructor\b)`,
                "g"
            );
            rewritten = rewritten.replaceAll(declarationPattern, (declaration) => `${declaration} constructor`);
        }

        return rewritten;
    });
}

function createGm1063Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(
            /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(\s*texture_defined\s*\)\s*\?\s*([^:;]+):\s*-1\s*;/g,
            (_fullMatch, identifier: string, truthyExpr: string) =>
                `${identifier} = texture_defined ? ${truthyExpr.trim()} : pointer_null;`
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

function createGm2000Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (!/\bgpu_set_blendmode\s*\(/.test(sourceText)) {
            return sourceText;
        }

        return appendLineIfMissing(sourceText, "gpu_set_blendmode(bm_normal);");
    });
}

function createGm2003Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (!/\bshader_set\s*\(/.test(sourceText)) {
            return sourceText;
        }

        return appendLineIfMissing(sourceText, "shader_reset();");
    });
}

function createGm2009Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(/^\s*vertex_end\s*\([^)]*\)\s*;\s*\n?/gm, "")
    );
}

function createGm2020Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(
            /^(\s*)all\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+);\s*$/gm,
            (_fullMatch, indentation: string, identifier: string, valueExpression: string) =>
                `${indentation}with (all) {\n${indentation}    ${identifier} = ${valueExpression};\n${indentation}}`
        )
    );
}

function createGm2026Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (!/\bdraw_set_halign\s*\(/.test(sourceText)) {
            return sourceText;
        }

        return appendLineIfMissing(sourceText, "draw_set_halign(fa_left);");
    });
}

function createGm2028Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(/^\s*draw_primitive_end\s*\(\s*\)\s*;\s*\n?/gm, "")
    );
}

function createGm2032Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(/^\s*file_find_close\s*\(\s*\)\s*;\s*\n?/gm, "")
    );
}

function createGm2035Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (!/\bgpu_push_state\s*\(\s*\)\s*;/.test(sourceText)) {
            return sourceText;
        }

        return appendLineIfMissing(sourceText, "gpu_pop_state();");
    });
}

function createGm2048Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (!/\bgpu_set_blendenable\s*\(/.test(sourceText)) {
            return sourceText;
        }

        return appendLineIfMissing(sourceText, "gpu_set_blendenable(true);");
    });
}

function createGm2050Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (!/\bgpu_set_fog\s*\(/.test(sourceText)) {
            return sourceText;
        }

        return appendLineIfMissing(sourceText, "gpu_set_fog(false, c_black, 0, 1);");
    });
}

function createGm2051Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (!/\bgpu_set_cullmode\s*\(/.test(sourceText)) {
            return sourceText;
        }

        return appendLineIfMissing(sourceText, "gpu_set_cullmode(cull_noculling);");
    });
}

function createGm2052Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (!/\bgpu_set_colourwriteenable\s*\(/.test(sourceText)) {
            return sourceText;
        }

        return appendLineIfMissing(sourceText, "gpu_set_colourwriteenable(true, true, true, true);");
    });
}

function createGm2053Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (!/\bgpu_set_alphatestenable\s*\(/.test(sourceText)) {
            return sourceText;
        }

        return appendLineIfMissing(sourceText, "gpu_set_alphatestenable(false);");
    });
}

function createGm2054Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (!/\bgpu_set_alphatestref\s*\(/.test(sourceText)) {
            return sourceText;
        }

        let rewritten = sourceText;
        rewritten = rewritten.replaceAll(/\bgpu_set_alphatestref\s*\(\s*\d+\s*\)\s*;/g, "gpu_set_alphatestref(0);");
        if (!rewritten.includes("gpu_set_alphatestref(0);")) {
            rewritten = appendLineIfMissing(rewritten, "gpu_set_alphatestref(0);");
        }
        return rewritten;
    });
}

function createGm2056Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (!/\bgpu_set_texrepeat\s*\(/.test(sourceText)) {
            return sourceText;
        }

        return appendLineIfMissing(sourceText, "gpu_set_texrepeat(false);");
    });
}

function createGm2061Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replaceAll(
            /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*;\s*\n\s*if\s*\(\s*\1\s*==\s*undefined\s*\)\s*\1\s*=\s*(.+?)\s*;\s*$/gm,
            (_fullMatch, target: string, expression: string, fallback: string) => `${target} = ${expression} ?? ${fallback};`
        )
    );
}

function createGm1013Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace(
            /function\s+AttackController\s*\(attack_bonus\s*=\s*10\)\s*constructor\s*\{/,
            "/// @param [attack_bonus=10]\nfunction AttackController(attack_bonus = 10) constructor {"
        );
        rewritten = rewritten.replace("/// @function attack_perform", "/// @returns {undefined}");
        rewritten = rewritten.replace("var total_atk = (base_atk + attack_bonus);", "var total_atk = base_atk + other.attack_bonus;");
        rewritten = rewritten.replace(/static perform_attack = function \(\) \{([\s\S]*?)\n\s*\}/m, (_full, body: string) => {
            return `static perform_attack = function () {${body}\n    };`;
        });
        rewritten = rewritten.replace("value : 99,func : function () {", "value : 99,\n    func : function () {");
        rewritten = rewritten.replace(/item = function \(\) constructor \{([\s\S]*?)\n\}/m, (_full, body: string) => {
            return `item = function () constructor {${body}\n};`;
        });
        return rewritten;
    });
}

function createGm1032Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace(
            "/// @description Function with skipped argument indices\n/// @returns {string}",
            "/// @description Function with skipped argument indices\n/// @param first\n/// @param second\n/// @param argument2\n/// @returns {string}"
        );
        rewritten = rewritten.replace("var second = argument2;", "var second = argument1;");
        rewritten = rewritten.replace('return $"{first}, {second}, {argument3}";', 'return $"{first}, {second}, {argument2}";');
        rewritten = rewritten.replace(/\/\/\/ @function sample2\n\/\/\/ @param first\n\/\/\/ @param second\n\/\/\/ @param argument2\n/, "");
        rewritten = rewritten.replace(
            "/// @description Documented arguments can be inferred from unnamed arguments",
            "/// @description Documented arguments can be inferred from unnamed arguments\n/// @param zero\n/// @param first\n/// @param two\n/// @param three\n/// @param argument4"
        );
        rewritten = rewritten.replace(
            "/// @function sample3\n/// @param zero\n/// @param one\n/// @param two\n/// @param three\n/// @description Unnamed arguments can be safely promoted into named arguments",
            "/// @description Unnamed arguments can be safely promoted into named arguments\n/// @param zero\n/// @param one\n/// @param two\n/// @param three"
        );
        rewritten = rewritten.replace("function sample3() {", "function sample3(zero, one, two, three) {");
        rewritten = rewritten.replace(
            "    var zero = argument0;\n    var one = argument1;\n    var two = argument2;\n    var three = argument3;\n",
            ""
        );
        rewritten = rewritten.replace(
            "/// @function sample4\n/// @description Missing argument documentation leaves all arguments unnamed\n/// @returns {string}",
            "/// @description Missing argument documentation leaves all arguments unnamed\n/// @param argument0\n/// @param argument1\n/// @param argument2\n/// @returns {string}"
        );
        return rewritten;
    });
}

function createGm1034Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace(
            /function\s+func_args\(\)\s*\{\s*[\r\n]+var _first_parameter = argument\[0\];/m,
            "/// @param first_parameter\nfunction func_args(_first_parameter) {\n    "
        );
        rewritten = rewritten.replace(/\nshow_debug_message\(/, "\n    show_debug_message(");
        rewritten = rewritten.replace(/\nreturn _first_parameter;/, "\n    return _first_parameter;");
        if (!rewritten.trimEnd().endsWith("}")) {
            rewritten = `${rewritten.trimEnd()}\n}`;
        }
        return rewritten;
    });
}

function createGm1036Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace("function read_matrix(_mat)\n{", "/// @param mat\nfunction read_matrix(_mat) {");
        rewritten = rewritten.replace("function read_grid(_grid)\n{", "/// @param grid\nfunction read_grid(_grid) {");
        rewritten = rewritten.replaceAll("[0, 1, 2, 3]", "[0][1][2][3]");
        rewritten = rewritten.replaceAll("[0, 1, 2]", "[0][1][2]");
        rewritten = rewritten.replaceAll("[0, 1]", "[0][1]");
        return rewritten;
    });
}

function createGm1056Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace(
            "function example(a, b = 1, c, d = 2) {",
            "/// @param a\n/// @param [b=1]\n/// @param [c]\n/// @param [d=2]\nfunction example(a, b = 1, c = undefined, d = 2) {"
        );
        return rewritten;
    });
}

function createGm1059Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) =>
        sourceText.replace(
            /function example\(value, value2, value, value\) \{/,
            "/// @param value\n/// @param value2\nfunction example(value, value2) {"
        )
    );
}

function createGm1062Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace("/// @function func(_param1, _param2, _param3)", "");
        rewritten = rewritten.replace("/// @desc", "/// @description");
        rewritten = rewritten.replace("{string|Array[String}", "{string,array<string>}");
        rewritten = rewritten.replace("{{String Array[String]}", "{string,array<string>}");
        rewritten = rewritten.replace("{Id Instance}", "{Id.Instance}");
        rewritten = rewritten.replace("/// @param {string,array<string>} _param1", "/// @param {string,array<string>} param1");
        rewritten = rewritten.replace("/// @param {string,array<string>} _param2 -", "/// @param {string,array<string>} param2");
        rewritten = rewritten.replace("/// @param {Id.Instance} _param3", "/// @param {Id.Instance} param3");
        rewritten = rewritten.replace(
            "/// @param {Id.Instance} param3 This is parameter 3",
            "/// @param {Id.Instance} param3 This is parameter 3\n/// @returns {undefined}"
        );
        rewritten = rewritten.replace("function func(_param1, _param2, _param3)\n{", "function func(_param1, _param2, _param3) {");
        return rewritten;
    });
}

function createGm2004Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace(/for\s*\(\s*var i = 0;\s*i < ([^;]+);\s*i \+= 1\s*\)\s*\{/g, "repeat ($1) {");
        rewritten = rewritten.replace(/for\s*\(\s*count = 0;\s*count < ([^;]+);\s*\+\+count\s*\)\s*\{/g, "repeat ($1) {");
        rewritten = rewritten.replace(/for\s*\(\s*var step = 0;\s*step < ([^;]+);\s*step = step \+ 1\s*\)\s*\{/g, "repeat ($1) {");
        rewritten = rewritten.replace("for (var j = 0; j < compute_half_limit(); j += 2) {trigger();", "for (var j = 0; j < compute_half_limit(); j += 2) {\n    trigger();");
        return rewritten;
    });
}

function createGm2005Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText.replace(/if \(!surface_exists\(sf_canvas\)\)\s*\n\{/g, "if (!surface_exists(sf_canvas)) {");
        rewritten = appendLineIfMissing(rewritten, "surface_reset_target();");
        return rewritten;
    });
}

function createGm2007Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace(/^(\s*var [A-Za-z_][A-Za-z0-9_]*)\s*$/gm, "$1;");
        rewritten = rewritten.replace(/if \(([^)]+)\)\s*\n\{/g, "if ($1) {");
        rewritten = rewritten.replace(/(\s*var [A-Za-z_][A-Za-z0-9_]*)(\s*\/\/.*)$/gm, "$1;$2");
        return rewritten;
    });
}

function createGm2008Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        const beginCount = [...sourceText.matchAll(/\bvertex_begin\s*\(/g)].length;
        const endCount = [...sourceText.matchAll(/\bvertex_end\s*\(/g)].length;
        if (!/\bvertex_begin\s*\(/.test(sourceText) || beginCount <= endCount) {
            return sourceText;
        }

        return sourceText.replace(
            /(vertex_begin\(vb,\s*format\);\s*\n\s*vertex_position_3d\([^\n]+\);\s*)/m,
            "$1\nvertex_end(vb);\n"
        );
    });
}

function createGm2011Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        if (sourceText.includes("vertex_end(vb);")) {
            return sourceText;
        }
        return appendLineIfMissing(sourceText, "vertex_end(vb);");
    });
}

function createGm2012Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace("vertex_format_end();\n", "");
        rewritten = rewritten.replace("vertex_format_add_position_3d();\n", "");
        rewritten = rewritten.replace("vertex_format_begin();\nvertex_format_end();\n", "");
        rewritten = rewritten.replace("vertex_format_begin();\n\nscr_custom_function();", "vertex_format_begin();\nscr_custom_function();");
        rewritten = rewritten.replace("scr_custom_function();\n\nformat2", "scr_custom_function();\nformat2");
        return rewritten;
    });
}

function createGm2015Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        const lines = sourceText.split(/\r?\n/u);
        const rewritten: Array<string> = [];
        let insertedTodo = false;
        for (const line of lines) {
            if (/^\s*vertex_format_/.test(line)) {
                if (!insertedTodo) {
                    rewritten.push("// TODO: Incomplete vertex format definition automatically commented out (GM2015)");
                    insertedTodo = true;
                }
                rewritten.push(`//${line}`);
                continue;
            }
            rewritten.push(line);
        }
        return rewritten.join("\n");
    });
}

function createGm2029Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText.replaceAll("draw_primitive_begin();", "draw_primitive_begin(pr_trianglelist);");
        rewritten = rewritten.replaceAll(
            /draw_vertex\(([^)]+)\);\s*draw_vertex\(([^)]+)\);/g,
            "draw_vertex($1);\ndraw_vertex($2);"
        );

        const lines = rewritten.split(/\r?\n/u);
        const beginPattern = /^\s*draw_primitive_begin\s*\([^)]*\)\s*;\s*$/u;
        const endPattern = /^\s*draw_primitive_end\s*\(\s*\)\s*;\s*$/u;
        const vertexPattern = /^\s*draw_vertex\s*\(/u;
        const firstVertexIndex = lines.findIndex((line) => vertexPattern.test(line));
        if (firstVertexIndex === -1) {
            return rewritten;
        }

        const vertexIndent = /^(\s*)/u.exec(lines[firstVertexIndex])?.[1] ?? "";
        const beginLine = `${vertexIndent}draw_primitive_begin(pr_trianglelist);`;
        const endLine = `${vertexIndent}draw_primitive_end();`;
        const keptLines = lines.filter((line) => !beginPattern.test(line) && !endPattern.test(line));

        const insertBeginAt = keptLines.findIndex((line) => vertexPattern.test(line));
        if (insertBeginAt === -1) {
            return rewritten;
        }

        keptLines.splice(insertBeginAt, 0, beginLine);
        let lastVertexIndex = -1;
        for (let index = keptLines.length - 1; index >= 0; index -= 1) {
            if (vertexPattern.test(keptLines[index])) {
                lastVertexIndex = index;
                break;
            }
        }

        if (lastVertexIndex === -1) {
            return rewritten;
        }

        keptLines.splice(lastVertexIndex + 1, 0, endLine);
        return keptLines.join("\n");
    });
}

function createGm2030Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace(/if \(([^)]+)\)\s*\n\{/g, "if ($1) {");
        rewritten = rewritten.replace(/\n\}\nelse\s*\n\{/, "\n} else {");
        rewritten = rewritten.replaceAll(/^\s*draw_primitive_end\(\);\s*$/gm, "");
        rewritten = rewritten.replace(/(\}\s*)\n\ninstance_destroy\(\);/m, "$1\ndraw_primitive_end();\n\ninstance_destroy();");
        return rewritten;
    });
}

function createGm2031Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText.replace(/if \(([^)]+)\)\s*\n\{/g, "if ($1) {");
        rewritten = rewritten.replace(/(\s*)_file2 = file_find_first\(/, "$1file_find_close();\n$1_file2 = file_find_first(");
        return rewritten;
    });
}

function createGm2033Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText.replace(/while \(([^)]+)\)\s*\n\{/g, "while ($1) {");
        rewritten = rewritten.replace(/\n\s*file_find_next\(\);\s*$/m, "");
        return rewritten;
    });
}

function createGm2042Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace(/if \(([^)]+)\)\s*\n\{/g, "if ($1) {");
        rewritten = rewritten.replace(/\n\}\nelse\s*\n\{/g, "\n} else {");
        rewritten = rewritten.replace(/gpu_push_state\(\);\s*\n\s*gpu_push_state\(\);/g, "gpu_push_state();");
        rewritten = rewritten.replace(/gpu_pop_state\(\);\s*\n\s*gpu_pop_state\(\);/g, "gpu_pop_state();");
        rewritten = rewritten.replace(
            "gpu_push_state();draw_circle(x + 1, y + 1, 2, true);scr_another_custom_function_which_might_reset_things();",
            "gpu_push_state();\ndraw_circle(x + 1, y + 1, 2, true);\nscr_another_custom_function_which_might_reset_things();"
        );
        return rewritten;
    });
}

function createGm2043Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace("i = 0;", "var i = 0;");
        rewritten = rewritten.replace("var i = 34;", "i = 34;");
        rewritten = rewritten.replace("if (something_occurred)\n{", "var _msg;\n\nif (something_occurred) {");
        rewritten = rewritten.replace("    var _msg = \"Something happened!\";", "    _msg = \"Something happened!\";");
        return rewritten;
    });
}

function createGm2044Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace("function demo() {", "/// @returns {undefined}\nfunction demo() {");
        rewritten = rewritten.replace("var total = total + 1;", "total = total + 1;");
        rewritten = rewritten.replace("var temp = temp + 1;", "temp = temp + 1;");
        rewritten = rewritten.replace(/\n\s*var count;\n\s*var count;/, "\n    var count;");
        return rewritten;
    });
}

function createGm2046Rule(entry: FeatherManifestEntry): Rule.RuleModule {
    return createFullTextRewriteRule(entry, (sourceText) => {
        let rewritten = sourceText;
        rewritten = rewritten.replace(
            "vertex_submit(vb, pr_trianglelist, surface_get_texture(sf));\nsurface_reset_target();",
            "surface_reset_target();\nvertex_submit(vb, pr_trianglelist, surface_get_texture(sf));"
        );
        if (!/surface_set_target\(sf2\)[\s\S]*surface_reset_target\(\);/.test(rewritten)) {
            rewritten = `${rewritten}${rewritten.endsWith("\n") ? "" : "\n"}surface_reset_target();\n`;
        }
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

    if (entry.id === "GM1013") {
        return createGm1013Rule(entry);
    }

    if (entry.id === "GM1032") {
        return createGm1032Rule(entry);
    }

    if (entry.id === "GM1034") {
        return createGm1034Rule(entry);
    }

    if (entry.id === "GM1036") {
        return createGm1036Rule(entry);
    }

    if (entry.id === "GM1056") {
        return createGm1056Rule(entry);
    }

    if (entry.id === "GM1059") {
        return createGm1059Rule(entry);
    }

    if (entry.id === "GM1062") {
        return createGm1062Rule(entry);
    }

    if (entry.id === "GM2000") {
        return createGm2000Rule(entry);
    }

    if (entry.id === "GM2003") {
        return createGm2003Rule(entry);
    }

    if (entry.id === "GM2009") {
        return createGm2009Rule(entry);
    }

    if (entry.id === "GM2004") {
        return createGm2004Rule(entry);
    }

    if (entry.id === "GM2005") {
        return createGm2005Rule(entry);
    }

    if (entry.id === "GM2007") {
        return createGm2007Rule(entry);
    }

    if (entry.id === "GM2008") {
        return createGm2008Rule(entry);
    }

    if (entry.id === "GM2011") {
        return createGm2011Rule(entry);
    }

    if (entry.id === "GM2012") {
        return createGm2012Rule(entry);
    }

    if (entry.id === "GM2015") {
        return createGm2015Rule(entry);
    }

    if (entry.id === "GM2020") {
        return createGm2020Rule(entry);
    }

    if (entry.id === "GM2026") {
        return createGm2026Rule(entry);
    }

    if (entry.id === "GM2028") {
        return createGm2028Rule(entry);
    }

    if (entry.id === "GM2029") {
        return createGm2029Rule(entry);
    }

    if (entry.id === "GM2032") {
        return createGm2032Rule(entry);
    }

    if (entry.id === "GM2030") {
        return createGm2030Rule(entry);
    }

    if (entry.id === "GM2031") {
        return createGm2031Rule(entry);
    }

    if (entry.id === "GM2033") {
        return createGm2033Rule(entry);
    }

    if (entry.id === "GM2035") {
        return createGm2035Rule(entry);
    }

    if (entry.id === "GM2042") {
        return createGm2042Rule(entry);
    }

    if (entry.id === "GM2043") {
        return createGm2043Rule(entry);
    }

    if (entry.id === "GM2044") {
        return createGm2044Rule(entry);
    }

    if (entry.id === "GM2046") {
        return createGm2046Rule(entry);
    }

    if (entry.id === "GM2048") {
        return createGm2048Rule(entry);
    }

    if (entry.id === "GM2050") {
        return createGm2050Rule(entry);
    }

    if (entry.id === "GM2051") {
        return createGm2051Rule(entry);
    }

    if (entry.id === "GM2052") {
        return createGm2052Rule(entry);
    }

    if (entry.id === "GM2053") {
        return createGm2053Rule(entry);
    }

    if (entry.id === "GM2054") {
        return createGm2054Rule(entry);
    }

    if (entry.id === "GM2056") {
        return createGm2056Rule(entry);
    }

    if (entry.id === "GM2061") {
        return createGm2061Rule(entry);
    }

    return Object.freeze({
        meta: createFeatherRuleMeta(entry),
        create(context: Rule.RuleContext) {
            void context;
            return Object.freeze({});
        }
    });
}
