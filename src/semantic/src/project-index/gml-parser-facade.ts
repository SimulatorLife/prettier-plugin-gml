import { Parser } from "@gml-modules/parser";
import { ScopeTracker } from "../scopes/index.js";
import { formatProjectIndexSyntaxError } from "./syntax-error-formatter.js";

function parseProjectIndexSource(sourceText, context = {}) {
    try {
        // Cast to any because ParserOptions differ across parser package types in the
        // workspace during incremental refactors. Provide the runtime options we need
        // while avoiding a compile-time type mismatch until the parser package is
        // fully rebuilt.
        return Parser.GMLParser.parse(sourceText, {
            getComments: false,
            getLocations: true,
            simplifyLocations: false,
            getIdentifierMetadata: true,
            createScopeTracker: ({ enabled }) =>
                enabled ? new ScopeTracker({ enabled }) : null
        } as any);
    } catch (error) {
        if (Parser.isSyntaxErrorWithLocation(error)) {
            throw formatProjectIndexSyntaxError(error, sourceText, context);
        }

        throw error;
    }
}

export function getDefaultProjectIndexParser() {
    return parseProjectIndexSource;
}
