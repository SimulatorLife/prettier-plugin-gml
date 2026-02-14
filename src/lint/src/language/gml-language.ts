import { Core } from "@gml-modules/core";
import { Parser } from "@gml-modules/parser";
import { SourceCode } from "eslint";

import { normalizeLintFilePath } from "./path-normalization.js";
import {
    createLimitedRecoveryProjection,
    type InsertedArgumentSeparatorRecovery,
    mapRecoveredIndexToOriginal,
    type RecoveryMode
} from "./recovery.js";

class GMLLanguageSourceCode extends SourceCode {
    finalize(): void {
        // Custom language source code has no JS scope manager integration.
    }
}

type GMLAstNode = {
    type: string;
    body: ReadonlyArray<unknown>;
    comments: ReadonlyArray<unknown>;
    tokens: ReadonlyArray<unknown>;
    sourceType: string;
};

type GMLLanguageOptions = {
    recovery: "none" | "limited";
};

type GMLLanguageContext = {
    body?: string | Uint8Array;
    text?: string;
    source?: string;
    path?: string;
    filePath?: string;
    filename?: string;
    bom?: boolean;
};

type ParseErrorChannel = {
    message: string;
    line: number;
    column: number;
};

type ParseFailureResult = {
    ok: false;
    errors: ParseErrorChannel[];
};

type ParseSuccessResult = {
    ok: true;
    ast: GMLAstNode;
    parserServices: Record<string, unknown>;
    visitorKeys: Record<string, string[]>;
};

type GMLParseResult = ParseFailureResult | ParseSuccessResult;

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

type GMLLanguage = {
    fileType: "text";
    lineStart: 1;
    columnStart: 0;
    nodeTypeKey: "type";
    defaultLanguageOptions: Readonly<GMLLanguageOptions>;
    visitorKeys: Record<string, string[]>;
    parse(file: GMLLanguageContext, context: { languageOptions?: unknown }): GMLParseResult;
    createSourceCode(
        file: GMLLanguageContext,
        parseResult: ParseSuccessResult,
        context: { languageOptions?: unknown }
    ): SourceCode;
    validateLanguageOptions(languageOptions: unknown): void;
    normalizeLanguageOptions(languageOptions: unknown): GMLLanguageOptions;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object") {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function normalizeProgramShape(ast: unknown): GMLAstNode {
    const program =
        ast && typeof ast === "object"
            ? (ast as Partial<GMLAstNode> & Record<string, unknown>)
            : ({ type: "Program", body: [] } as Partial<GMLAstNode> & Record<string, unknown>);

    if (!Array.isArray(program.body)) {
        program.body = [];
    }

    if (!Array.isArray(program.comments)) {
        program.comments = [];
    }

    if (!Array.isArray(program.tokens)) {
        program.tokens = [];
    }

    if (typeof program.sourceType !== "string") {
        program.sourceType = "script";
    }

    if (typeof program.type !== "string") {
        program.type = "Program";
    }

    return program as GMLAstNode;
}

function decodeFileBody(body: string | Uint8Array): string {
    if (typeof body === "string") {
        return body;
    }

    return new TextDecoder("utf-8", { fatal: false }).decode(body);
}

function readSourceText(context: GMLLanguageContext): string {
    if (Core.isUint8ArrayLike(context.body) || typeof context.body === "string") {
        return decodeFileBody(context.body);
    }

    if (typeof context.text === "string") {
        return context.text;
    }

    if (typeof context.source === "string") {
        return context.source;
    }

    return "";
}

function readFilename(context: GMLLanguageContext): string {
    if (typeof context.path === "string" && context.path.length > 0) {
        return context.path;
    }

    if (typeof context.filePath === "string" && context.filePath.length > 0) {
        return context.filePath;
    }

    if (typeof context.filename === "string" && context.filename.length > 0) {
        return context.filename;
    }

    return "<text>";
}

function normalizeRecoveryOption(languageOptions: unknown): GMLLanguageOptions {
    if (!languageOptions || typeof languageOptions !== "object") {
        return { recovery: "limited" };
    }

    const options = languageOptions as Record<string, unknown>;
    const recovery = options.recovery;

    if (recovery === "none" || recovery === "limited") {
        return { recovery };
    }

    return { recovery: "limited" };
}

function readRecoveryMode(parseContext: { languageOptions?: unknown }): RecoveryMode {
    return normalizeRecoveryOption(parseContext.languageOptions).recovery;
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
            if (sourceText[cursor + 1] === "\n") {
                cursor += 1;
            }
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
    if (startIndex === null || endIndexInclusive === null) {
        return;
    }

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

function assignRangesRecursively(node: unknown): void {
    if (!node || typeof node !== "object") {
        return;
    }

    const candidate = node as Record<string, unknown>;
    const start = candidate.start;
    const end = candidate.end;
    if (typeof start === "number" && typeof end === "number" && !Array.isArray(candidate.range)) {
        candidate.range = [start, end];
    }

    for (const value of Object.values(candidate)) {
        if (Array.isArray(value)) {
            for (const element of value) {
                assignRangesRecursively(element);
            }
            continue;
        }

        assignRangesRecursively(value);
    }
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
    ast: GMLAstNode;
    parserServices: Record<string, unknown>;
    visitorKeys: Record<string, string[]>;
    hasBOM: boolean;
}): SourceCode {
    const modernSourceCode = GMLLanguageSourceCode as unknown as {
        new (options: {
            text: string;
            ast: GMLAstNode;
            hasBOM: boolean;
            parserServices: Record<string, unknown>;
            visitorKeys: Record<string, string[]>;
        }): SourceCode;
    };

    return new modernSourceCode({
        text: parameters.text,
        ast: parameters.ast,
        hasBOM: parameters.hasBOM,
        parserServices: parameters.parserServices,
        visitorKeys: parameters.visitorKeys
    });
}

function getErrorLineColumn(error: unknown): { line: number; column: number; message: string } {
    const fallback = { line: 1, column: 1, message: "Unknown parse error" };
    if (!Core.isErrorLike(error)) {
        return fallback;
    }

    const lineCandidate = Reflect.get(error, "lineNumber") ?? Reflect.get(error, "line");
    const columnCandidate =
        Reflect.get(error, "column") ?? Reflect.get(error, "columnNumber") ?? Reflect.get(error, "col");

    const line = typeof lineCandidate === "number" && Number.isFinite(lineCandidate) ? lineCandidate : 1;
    const column = typeof columnCandidate === "number" && Number.isFinite(columnCandidate) ? columnCandidate : 1;

    return {
        line,
        column,
        message: error.message
    };
}

export const GML_VISITOR_KEYS = Object.freeze({}) as Record<string, string[]>;

function parseAst(text: string): GMLAstNode {
    const parser = new Parser.GMLParser(text, {
        astFormat: "gml",
        asJSON: false,
        getComments: true,
        getLocations: true,
        simplifyLocations: false
    });
    return normalizeProgramShape(parser.parse());
}

export const gmlLanguage = Object.freeze({
    fileType: "text",
    lineStart: 1,
    columnStart: 0,
    nodeTypeKey: "type",
    defaultLanguageOptions: Object.freeze({ recovery: "limited" }),
    visitorKeys: GML_VISITOR_KEYS,
    parse(file: GMLLanguageContext, parseContext: { languageOptions?: unknown }) {
        const sourceText = readSourceText(file);
        const filePath = normalizeLintFilePath(readFilename(file));
        const recoveryMode = readRecoveryMode(parseContext);

        try {
            const ast = parseAst(sourceText);
            projectLocationsToOriginalSource(ast, sourceText, Object.freeze([]));
            assignRangesRecursively(ast);
            return {
                ok: true,
                ast,
                parserServices: createParserServices(filePath, Object.freeze([])),
                visitorKeys: GML_VISITOR_KEYS
            };
        } catch (strictParseError) {
            if (recoveryMode === "none") {
                const details = getErrorLineColumn(strictParseError);
                return {
                    ok: false,
                    errors: [
                        {
                            message: details.message,
                            line: details.line,
                            column: details.column
                        }
                    ]
                };
            }

            const recoveryProjection = createLimitedRecoveryProjection(sourceText);
            if (recoveryProjection.insertions.length === 0) {
                const details = getErrorLineColumn(strictParseError);
                return {
                    ok: false,
                    errors: [
                        {
                            message: details.message,
                            line: details.line,
                            column: details.column
                        }
                    ]
                };
            }

            try {
                const ast = parseAst(recoveryProjection.parseSource);
                projectLocationsToOriginalSource(ast, sourceText, recoveryProjection.insertions);
                assignRangesRecursively(ast);
                return {
                    ok: true,
                    ast,
                    parserServices: createParserServices(filePath, Object.freeze(recoveryProjection.insertions)),
                    visitorKeys: GML_VISITOR_KEYS
                };
            } catch {
                const details = getErrorLineColumn(strictParseError);
                return {
                    ok: false,
                    errors: [
                        {
                            message: details.message,
                            line: details.line,
                            column: details.column
                        }
                    ]
                };
            }
        }
    },
    createSourceCode(
        file: GMLLanguageContext,
        parseResult: ParseSuccessResult,
        _context: { languageOptions?: unknown }
    ) {
        const sourceText = readSourceText(file);
        const ast = normalizeProgramShape(parseResult.ast);
        assignRangesRecursively(ast);

        const parserServices =
            parseResult.parserServices && typeof parseResult.parserServices === "object"
                ? parseResult.parserServices
                : Object.freeze({});
        const visitorKeys =
            parseResult.visitorKeys && typeof parseResult.visitorKeys === "object"
                ? parseResult.visitorKeys
                : GML_VISITOR_KEYS;

        return createSourceCodeInstance({
            text: sourceText,
            ast,
            parserServices,
            visitorKeys,
            hasBOM: file.bom === true
        });
    },
    validateLanguageOptions(languageOptions: unknown) {
        if (!languageOptions || typeof languageOptions !== "object") {
            return;
        }

        const options = languageOptions as Record<string, unknown>;

        if ("parser" in options || "parserOptions" in options) {
            throw new TypeError("GML_LANGUAGE_OPTIONS_UNSUPPORTED_KEY");
        }

        const recovery = options.recovery;
        if (recovery !== undefined && recovery !== "none" && recovery !== "limited") {
            throw new TypeError("GML_LANGUAGE_OPTIONS_UNSUPPORTED_KEY");
        }
    },
    normalizeLanguageOptions(languageOptions: unknown) {
        return normalizeRecoveryOption(languageOptions);
    }
} satisfies GMLLanguage);
