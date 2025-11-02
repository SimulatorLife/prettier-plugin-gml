import GMLParser, {
    isSyntaxErrorWithLocation
} from "gamemaker-language-parser";
import { ScopeTracker } from "../scopes/index.js";
import { formatProjectIndexSyntaxError } from "./syntax-error-formatter.js";

function parseProjectIndexSource(sourceText, context = {}) {
    try {
        return GMLParser.parse(sourceText, {
            getComments: false,
            getLocations: true,
            simplifyLocations: false,
            getIdentifierMetadata: true,
            createScopeTracker: ({ enabled }) =>
                enabled ? new ScopeTracker({ enabled }) : null
        });
    } catch (error) {
        if (isSyntaxErrorWithLocation(error)) {
            throw formatProjectIndexSyntaxError(error, sourceText, context);
        }

        throw error;
    }
}

export function getDefaultProjectIndexParser() {
    return parseProjectIndexSource;
}
