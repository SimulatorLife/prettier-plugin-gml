import { SemanticScopeCoordinator } from "../scopes/identifier-scope.js";
import { formatProjectIndexSyntaxError } from "./syntax-error-formatter.js";

// TODO: This is a workaround because currently the parser and 'semantic' depend on each other. Need to properly decouple. Once the parser is fully rebuilt we can likely remove this and directly import from the parser package (or have 'parser' have one-way dependency on 'semantic').
type ParserNamespace = typeof import("@gml-modules/parser").Parser;

let parserNamespace: ParserNamespace | null = null;

export function setProjectIndexParserNamespace(parser: ParserNamespace): void {
    parserNamespace = parser;
}

function resolveParserNamespace(parser?: ParserNamespace): ParserNamespace {
    if (parser) {
        return parser;
    }

    if (parserNamespace) {
        return parserNamespace;
    }

    throw new Error(
        "Parser namespace is not initialized; call setProjectIndexParserNamespace first."
    );
}

function parseProjectIndexSource(
    sourceText: string,
    context = {},
    parser: ParserNamespace | null = null
) {
    const parserApi = resolveParserNamespace(parser);

    try {
        // TODO: Fix/correct this. We just casted to 'any' because ParserOptions differs across parser package types in the
        // workspace during incremental refactors, so provided the runtime options we needed
        // while avoiding a compile-time type mismatch until the parser package is
        // fully rebuilt.
        return parserApi.GMLParser.parse(sourceText, {
            getComments: false,
            getLocations: true,
            simplifyLocations: false,
            getIdentifierMetadata: true,
            createScopeTracker: ({ enabled }) =>
                enabled ? new SemanticScopeCoordinator() : null
        } as any);
    } catch (error) {
        if (parserApi.isSyntaxErrorWithLocation(error)) {
            throw formatProjectIndexSyntaxError(error, sourceText, context);
        }

        throw error;
    }
}

export function getDefaultProjectIndexParser(
    parser: ParserNamespace | null = null
) {
    return (sourceText: string, context = {}) =>
        parseProjectIndexSource(sourceText, context, parser);
}
