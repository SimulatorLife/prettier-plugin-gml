import GMLParser, {
    isSyntaxErrorWithLocation
} from "gamemaker-language-parser";
import { formatProjectIndexSyntaxError } from "../../../shared/reporting.js";

function parseProjectIndexSource(sourceText, context = {}) {
    try {
        return GMLParser.parse(sourceText, {
            getComments: false,
            getLocations: true,
            simplifyLocations: false,
            getIdentifierMetadata: true
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
