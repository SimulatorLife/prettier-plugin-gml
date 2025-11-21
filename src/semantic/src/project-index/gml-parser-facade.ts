import { Parser } from "@gml-modules/parser";
import { ScopeTracker } from "../scopes/index.js";
import { formatProjectIndexSyntaxError } from "./syntax-error-formatter.js";

function parseProjectIndexSource(sourceText, context = {}) {
    try {
        return Parser.GMLParser.parse(sourceText, {
            getComments: false,
            getLocations: true,
            simplifyLocations: false,
            getIdentifierMetadata: true,
            createScopeTracker: ({ enabled }) =>
                enabled ? new ScopeTracker({ enabled }) : null
        });
    } catch (error) {
        if (Parser.Utils.isSyntaxErrorWithLocation(error)) {
            throw formatProjectIndexSyntaxError(error, sourceText, context);
        }

        throw error;
    }
}

export function getDefaultProjectIndexParser() {
    return parseProjectIndexSource;
}
