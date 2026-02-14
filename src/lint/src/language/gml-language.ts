import { Parser } from "@gml-modules/parser";
import { SourceCode } from "eslint";

import { normalizeLintFilePath } from "./path-normalization.js";

function normalizeProgramShape(ast: any): any {
    const program = ast && typeof ast === "object" ? ast : { type: "Program", body: [] };

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

    return program;
}

function readSourceText(context: any): string {
    if (typeof context === "string") {
        return context;
    }

    if (context && typeof context.text === "string") {
        return context.text;
    }

    if (context && typeof context.source === "string") {
        return context.source;
    }

    return "";
}

function readFilename(context: any): string {
    if (context && typeof context.filePath === "string" && context.filePath.length > 0) {
        return context.filePath;
    }

    if (context && typeof context.filename === "string" && context.filename.length > 0) {
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
        return new modernSourceCode({
            text: parameters.text,
            ast: parameters.ast,
            parserServices: parameters.parserServices,
            visitorKeys: parameters.visitorKeys
        });
    } catch {
        const legacySourceCode = SourceCode as unknown as {
            new (text: string, ast: any): SourceCode;
        };

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
    parse(context: unknown) {
        const sourceText = readSourceText(context);
        const filename = readFilename(context);

        try {
            const parser = new Parser.GMLParser(sourceText, {
                astFormat: "estree",
                asJSON: false,
                getComments: true,
                getLocations: true,
                simplifyLocations: false
            });

            const ast = normalizeProgramShape(parser.parse());
            const parserServices = Object.freeze({
                gml: Object.freeze({
                    schemaVersion: 1,
                    filePath: normalizeLintFilePath(filename),
                    recovery: Object.freeze([]),
                    directives: Object.freeze([]),
                    enums: Object.freeze([])
                })
            });

            return Object.freeze({
                ok: true,
                ast,
                parserServices,
                visitorKeys: GML_VISITOR_KEYS
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown parse error";
            return Object.freeze({
                ok: false,
                errors: Object.freeze([
                    Object.freeze({
                        message,
                        line: 1,
                        column: 1
                    })
                ])
            });
        }
    },
    createSourceCode(context: unknown, parseResult: any) {
        const sourceText = readSourceText(context);
        const normalizedResult = parseResult && typeof parseResult === "object" ? parseResult : {};
        const ast = normalizeProgramShape(normalizedResult.ast);
        assignRangesRecursively(ast);
        const parserServices =
            normalizedResult.parserServices && typeof normalizedResult.parserServices === "object"
                ? normalizedResult.parserServices
                : Object.freeze({});
        const visitorKeys =
            normalizedResult.visitorKeys && typeof normalizedResult.visitorKeys === "object"
                ? normalizedResult.visitorKeys
                : GML_VISITOR_KEYS;

        return createSourceCodeInstance({
            text: sourceText,
            ast,
            parserServices,
            visitorKeys
        });
    },
    validateLanguageOptions(languageOptions: unknown) {
        if (!languageOptions || typeof languageOptions !== "object") {
            return;
        }

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
