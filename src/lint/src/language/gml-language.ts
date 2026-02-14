import { Parser } from "@gml-modules/parser";
import { SourceCode } from "eslint";

import { normalizeLintFilePath } from "./path-normalization.js";
import {
    createLimitedRecoveryProjection,
    type InsertedArgumentSeparatorRecovery,
    mapRecoveredIndexToOriginal,
    type RecoveryMode
} from "./recovery.js";

type GmlParserServices = {
    readonly gml: {
        readonly schemaVersion: 1;
        readonly filePath: string;
        readonly recovery: ReadonlyArray<InsertedArgumentSeparatorRecovery>;
        readonly directives: ReadonlyArray<string>;
        readonly enums: ReadonlyArray<string>;
    };
};

type IndexedLocation = { line?: unknown; index?: unknown; column?: unknown };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function normalizeProgramShape(ast: any): any {
    const program = ast && typeof ast === "object" ? ast : { type: "Program", body: [] };
    if (!Array.isArray(program.body)) program.body = [];
    if (!Array.isArray(program.comments)) program.comments = [];
    if (!Array.isArray(program.tokens)) program.tokens = [];
    if (typeof program.sourceType !== "string") program.sourceType = "script";
    return program;
}

function readSourceText(context: any): string {
    if (typeof context === "string") return context;
    if (context && typeof context.text === "string") return context.text;
    if (context && typeof context.source === "string") return context.source;
    return "";
}

function readFilename(context: any): string {
    if (context && typeof context.filePath === "string" && context.filePath.length > 0) return context.filePath;
    if (context && typeof context.filename === "string" && context.filename.length > 0) return context.filename;
    return "<text>";
}

function readRecoveryMode(parseContext: unknown): RecoveryMode {
    const recoveryValue = (parseContext as { languageOptions?: { recovery?: unknown } } | undefined)?.languageOptions
        ?.recovery;
    return recoveryValue === "none" ? "none" : "limited";
}

function toIndexedLocation(value: unknown): IndexedLocation | null {
    return value && typeof value === "object" ? (value as IndexedLocation) : null;
}

function mapIndexToLoc(sourceText: string, index: number): { line: number; column: number } {
    const boundedIndex = Math.max(0, Math.min(index, sourceText.length));
    let line = 1;
    let lineStart = 0;
    for (let cursor = 0; cursor < boundedIndex; cursor += 1) {
        const character = sourceText[cursor] ?? "";
        if (character === "\n") {
            line += 1;
            lineStart = cursor + 1;
            continue;
        }
        if (character === "\r") {
            if (sourceText[cursor + 1] === "\n") cursor += 1;
            line += 1;
            lineStart = cursor + 1;
        }
    }
    return { line, column: boundedIndex - lineStart };
}

function ensureRangeAndLocFromStartEnd(record: Record<string, unknown>, sourceText: string): void {
    const startLocation = toIndexedLocation(record.start);
    const endLocation = toIndexedLocation(record.end);
    const startIndex = typeof startLocation?.index === "number" ? startLocation.index : null;
    const endIndexInclusive = typeof endLocation?.index === "number" ? endLocation.index : null;
    if (startIndex === null || endIndexInclusive === null) return;

    const endExclusive = Math.max(startIndex, endIndexInclusive + 1);
    const startLoc = mapIndexToLoc(sourceText, startIndex);
    const endLoc = mapIndexToLoc(sourceText, endExclusive);

    record.range = [startIndex, endExclusive];
    record.loc = {
        start: Object.assign({}, startLoc, { index: startIndex }),
        end: Object.assign({}, endLoc, { index: endExclusive })
    };
    record.start = Object.assign({}, startLoc, { index: startIndex });
    record.end = Object.assign({}, mapIndexToLoc(sourceText, endIndexInclusive), { index: endIndexInclusive });
}

function projectLocationsToOriginalSource(
    ast: unknown,
    sourceText: string,
    insertions: ReadonlyArray<InsertedArgumentSeparatorRecovery>
): void {
    const childKeys = [
        "body",
        "arguments",
        "object",
        "left",
        "right",
        "expression",
        "expressions",
        "declarations",
        "declaration",
        "init",
        "test",
        "update",
        "consequent",
        "alternate",
        "cases",
        "statements",
        "property",
        "properties",
        "elements",
        "comments",
        "tokens",
        "params",
        "id",
        "key",
        "value"
    ] as const;

    const seen = new Set<object>();

    const visit = (candidate: unknown): void => {
        if (!candidate || typeof candidate !== "object") {
            return;
        }

        if (seen.has(candidate)) {
            return;
        }

        seen.add(candidate);

        if (Array.isArray(candidate)) {
            for (const entry of candidate) {
                visit(entry);
            }
            return;
        }

        if (!isPlainRecord(candidate)) {
            return;
        }

        const record = candidate;
        const startLocation = toIndexedLocation(record.start);
        if (typeof startLocation?.index === "number") {
            startLocation.index = mapRecoveredIndexToOriginal(startLocation.index, insertions);
        }

        const endLocation = toIndexedLocation(record.end);
        if (typeof endLocation?.index === "number") {
            endLocation.index = mapRecoveredIndexToOriginal(endLocation.index, insertions);
        }

        ensureRangeAndLocFromStartEnd(record, sourceText);

        for (const key of childKeys) {
            if (Object.hasOwn(record, key)) {
                visit(record[key]);
            }
        }
    };

    visit(ast);
}

function createParserServices(
    filePath: string,
    recovery: ReadonlyArray<InsertedArgumentSeparatorRecovery>
): GmlParserServices {
    return Object.freeze({
        gml: Object.freeze({
            schemaVersion: 1,
            filePath,
            recovery,
            directives: Object.freeze([]),
            enums: Object.freeze([])
        })
    });
}

function createSourceCodeInstance(parameters: {
    text: string;
    ast: any;
    parserServices: Record<string, unknown>;
    visitorKeys: Record<string, ReadonlyArray<string>>;
}): SourceCode {
    const modernSourceCode = SourceCode as unknown as {
        new (options: {
            text: string;
            ast: any;
            parserServices: Record<string, unknown>;
            visitorKeys: Record<string, ReadonlyArray<string>>;
        }): SourceCode;
    };

    try {
        return new modernSourceCode(parameters);
    } catch {
        const legacySourceCode = SourceCode as unknown as { new (text: string, ast: any): SourceCode };
        const fallback = new legacySourceCode(parameters.text, parameters.ast);
        Reflect.set(fallback as object, "parserServices", parameters.parserServices);
        return fallback;
    }
}

export const GML_VISITOR_KEYS = Object.freeze({});

export const gmlLanguage = Object.freeze({
    fileType: "text",
    lineStart: 1,
    columnStart: 0,
    nodeTypeKey: "type",
    defaultLanguageOptions: Object.freeze({ recovery: "limited" }),
    visitorKeys: GML_VISITOR_KEYS,
    parse(context: unknown, parseContext: unknown) {
        const sourceText = readSourceText(context);
        const filePath = normalizeLintFilePath(readFilename(context));
        const recoveryMode = readRecoveryMode(parseContext);

        const parseAst = (text: string): any => {
            const parser = new Parser.GMLParser(text, {
                astFormat: "gml",
                asJSON: false,
                getComments: true,
                getLocations: true,
                simplifyLocations: false
            });
            return normalizeProgramShape(parser.parse());
        };

        try {
            const ast = parseAst(sourceText);
            projectLocationsToOriginalSource(ast, sourceText, Object.freeze([]));
            return Object.freeze({
                ok: true,
                ast,
                parserServices: createParserServices(filePath, Object.freeze([])),
                visitorKeys: GML_VISITOR_KEYS
            });
        } catch (strictParseError) {
            if (recoveryMode === "none") {
                const message = strictParseError instanceof Error ? strictParseError.message : "Unknown parse error";
                return Object.freeze({
                    ok: false,
                    errors: Object.freeze([Object.freeze({ message, line: 1, column: 1 })])
                });
            }

            const recoveryProjection = createLimitedRecoveryProjection(sourceText);
            if (recoveryProjection.insertions.length === 0) {
                const message = strictParseError instanceof Error ? strictParseError.message : "Unknown parse error";
                return Object.freeze({
                    ok: false,
                    errors: Object.freeze([Object.freeze({ message, line: 1, column: 1 })])
                });
            }

            try {
                const ast = parseAst(recoveryProjection.parseSource);
                projectLocationsToOriginalSource(ast, sourceText, recoveryProjection.insertions);
                return Object.freeze({
                    ok: true,
                    ast,
                    parserServices: createParserServices(filePath, Object.freeze(recoveryProjection.insertions)),
                    visitorKeys: GML_VISITOR_KEYS
                });
            } catch {
                const message = strictParseError instanceof Error ? strictParseError.message : "Unknown parse error";
                return Object.freeze({
                    ok: false,
                    errors: Object.freeze([Object.freeze({ message, line: 1, column: 1 })])
                });
            }
        }
    },
    createSourceCode(context: unknown, parseResult: any) {
        const sourceText = readSourceText(context);
        const normalizedResult = parseResult && typeof parseResult === "object" ? parseResult : {};
        const ast = normalizeProgramShape(normalizedResult.ast);
        const parserServices =
            normalizedResult.parserServices && typeof normalizedResult.parserServices === "object"
                ? normalizedResult.parserServices
                : Object.freeze({});
        const visitorKeys =
            normalizedResult.visitorKeys && typeof normalizedResult.visitorKeys === "object"
                ? normalizedResult.visitorKeys
                : GML_VISITOR_KEYS;

        return createSourceCodeInstance({ text: sourceText, ast, parserServices, visitorKeys });
    },
    validateLanguageOptions(languageOptions: unknown) {
        if (!languageOptions || typeof languageOptions !== "object") return;
        const options = languageOptions as Record<string, unknown>;
        if ("parser" in options || "parserOptions" in options) {
            throw new Error("GML_LANGUAGE_OPTIONS_UNSUPPORTED_KEY");
        }
        const recovery = options.recovery;
        if (recovery !== undefined && recovery !== "none" && recovery !== "limited") {
            throw new Error("GML_LANGUAGE_OPTIONS_UNSUPPORTED_KEY");
        }
    }
});
