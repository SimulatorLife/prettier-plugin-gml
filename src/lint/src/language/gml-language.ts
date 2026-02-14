import { Parser } from "@gml-modules/parser";
import { SourceCode } from "eslint";

import { normalizeLintFilePath } from "./path-normalization.js";

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

type SourceLocationPoint = { line: number; column: number };

type SourceLocationRange = {
    start: SourceLocationPoint;
    end: SourceLocationPoint;
};

function ensureRangeMetadata(node: Record<string, unknown>): void {
    const nodeRange = node.range;
    if (
        !Array.isArray(nodeRange) ||
        nodeRange.length !== 2 ||
        typeof nodeRange[0] !== "number" ||
        typeof nodeRange[1] !== "number"
    ) {
        node.range = [0, 0];
    }

    const nodeLoc = node.loc;
    const hasValidLoc =
        nodeLoc &&
        typeof nodeLoc === "object" &&
        typeof (nodeLoc as { start?: { line?: unknown; column?: unknown } }).start?.line === "number" &&
        typeof (nodeLoc as { start?: { line?: unknown; column?: unknown } }).start?.column === "number" &&
        typeof (nodeLoc as { end?: { line?: unknown; column?: unknown } }).end?.line === "number" &&
        typeof (nodeLoc as { end?: { line?: unknown; column?: unknown } }).end?.column === "number";

    if (!hasValidLoc) {
        const defaultPoint: SourceLocationPoint = { line: 1, column: 0 };
        const defaultLocation: SourceLocationRange = { start: defaultPoint, end: defaultPoint };
        node.loc = defaultLocation;
    }
}

function attachRequiredLocationMetadata(programNode: Record<string, unknown>): void {
    const pendingNodes: Record<string, unknown>[] = [programNode];

    while (pendingNodes.length > 0) {
        const currentNode = pendingNodes.pop();
        if (!currentNode) {
            continue;
        }

        if (typeof currentNode.type === "string") {
            ensureRangeMetadata(currentNode);
        }

        for (const childValue of Object.values(currentNode)) {
            if (Array.isArray(childValue)) {
                for (const entry of childValue) {
                    if (entry && typeof entry === "object") {
                        pendingNodes.push(entry as Record<string, unknown>);
                    }
                }
                continue;
            }

            if (childValue && typeof childValue === "object") {
                pendingNodes.push(childValue as Record<string, unknown>);
            }
        }
    }
}

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

    attachRequiredLocationMetadata(program);

    return program as GMLAstNode;
}

function decodeFileBody(body: string | Uint8Array): string {
    if (typeof body === "string") {
        return body;
    }

    return new TextDecoder("utf-8", { fatal: false }).decode(body);
}

function readSourceText(context: GMLLanguageContext): string {
    if (context.body instanceof Uint8Array || typeof context.body === "string") {
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

function getErrorLineColumn(error: unknown): { line: number; column: number; message: string } {
    const fallback = { line: 1, column: 1, message: "Unknown parse error" };
    if (!(error instanceof Error)) {
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

export const GML_VISITOR_KEYS = Object.freeze({}) as Record<string, string[]>;

export const gmlLanguage = Object.freeze({
    fileType: "text",
    lineStart: 1,
    columnStart: 0,
    nodeTypeKey: "type",
    defaultLanguageOptions: Object.freeze({ recovery: "limited" }),
    visitorKeys: GML_VISITOR_KEYS,
    parse(file: GMLLanguageContext, _context: { languageOptions?: unknown }) {
        const sourceText = readSourceText(file);
        const filename = readFilename(file);

        try {
            const parser = new Parser.GMLParser(sourceText, {
                astFormat: "estree",
                asJSON: false,
                getComments: true,
                getLocations: true,
                simplifyLocations: false
            });

            const ast = normalizeProgramShape(parser.parse());
            const parserServices = {
                gml: {
                    schemaVersion: 1,
                    filePath: normalizeLintFilePath(filename),
                    recovery: [],
                    directives: [],
                    enums: []
                }
            };

            return {
                ok: true,
                ast,
                parserServices,
                visitorKeys: GML_VISITOR_KEYS
            };
        } catch (error) {
            const details = getErrorLineColumn(error);
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
