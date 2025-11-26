import { SemanticScopeCoordinator } from "../scopes/identifier-scope.js";
import { formatProjectIndexSyntaxError } from "./syntax-error-formatter.js";

type ParserNamespace = {
    GMLParser: { parse: (text: string, options?: any) => any };
    isSyntaxErrorWithLocation: (value: unknown) => boolean;
};

let parserNamespace: ParserNamespace | null = null;

export function setProjectIndexParser(parser: ParserNamespace) {
    parserNamespace = parser;
}

function parseProjectIndexSource(sourceText, context = {}) {
    if (!parserNamespace) {
        throw new Error("Project index parser is not configured.");
    }

    try {
        // TODO: Fix/correct this. We just casted to 'any' because ParserOptions differs across parser package types in the
        // workspace during incremental refactors, so provided the runtime options we needed
        // while avoiding a compile-time type mismatch until the parser package is
        // fully rebuilt.
        return parserNamespace.GMLParser.parse(sourceText, {
            getComments: false,
            getLocations: true,
            simplifyLocations: false,
            getIdentifierMetadata: true,
            createScopeTracker: ({ enabled }) =>
                enabled ? new SemanticScopeCoordinator() : null
        } as any);
    } catch (error) {
        if (parserNamespace.isSyntaxErrorWithLocation(error)) {
            throw formatProjectIndexSyntaxError(error, sourceText, context);
        }

        throw error;
    }
}

export function getDefaultProjectIndexParser() {
    return parseProjectIndexSource;
}
