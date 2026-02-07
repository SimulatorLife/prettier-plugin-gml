import { Yy } from "@bscotch/yy";
import { Core } from "@gml-modules/core";

const PROJECT_METADATA_PARSE_ERROR = "ProjectMetadataParseError";

/**
 * Error raised when a GameMaker metadata payload (.yy/.yyp) cannot be parsed.
 */
export class ProjectMetadataParseError extends Error {
    constructor(sourcePath: string, cause: unknown) {
        const details = Core.getErrorMessageOrFallback(cause);
        super(`Failed to parse GameMaker metadata from '${sourcePath}': ${details}`);
        this.name = PROJECT_METADATA_PARSE_ERROR;
        this.cause = cause instanceof Error ? cause : undefined;
    }
}

/**
 * Type guard for {@link ProjectMetadataParseError}.
 */
export function isProjectMetadataParseError(value: unknown): value is ProjectMetadataParseError {
    return (
        value instanceof ProjectMetadataParseError ||
        Core.getNonEmptyString((value as { name?: string })?.name) === PROJECT_METADATA_PARSE_ERROR
    );
}

/**
 * Parse a GameMaker metadata document using Stitch's yy parser.
 */
export function parseProjectMetadataDocument(rawContents: string, sourcePath: string) {
    let parsed: unknown;
    try {
        parsed = Yy.parse(rawContents);
    } catch (error) {
        throw new ProjectMetadataParseError(sourcePath, error);
    }

    return Core.assertPlainObject(parsed, {
        errorMessage: `Resource JSON at ${sourcePath} must be a plain object.`
    });
}

/**
 * Stringify a metadata payload using Stitch's yy serializer.
 */
export function stringifyProjectMetadataDocument(document: Record<string, unknown>) {
    return Yy.stringify(document);
}
