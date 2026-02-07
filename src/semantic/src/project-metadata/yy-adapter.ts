import { Yy } from "@bscotch/yy";
import { Core } from "@gml-modules/core";

const PROJECT_METADATA_PARSE_ERROR = "ProjectMetadataParseError";

const RESOURCE_TYPE_TO_SCHEMA_NAME = Object.freeze({
    GMProject: "project",
    GMObject: "objects",
    GMScript: "scripts",
    GMRoom: "rooms",
    GMShader: "shaders",
    GMSound: "sounds",
    GMSprite: "sprites",
    GMExtension: "extensions",
    GMRoomUI: "roomui"
});

const RESOURCE_FOLDER_TO_SCHEMA_NAME = Object.freeze({
    animcurves: "animcurves",
    extensions: "extensions",
    fonts: "fonts",
    notes: "notes",
    objects: "objects",
    particles: "particles",
    paths: "paths",
    rooms: "rooms",
    roomui: "roomui",
    scripts: "scripts",
    sequences: "sequences",
    shaders: "shaders",
    sounds: "sounds",
    sprites: "sprites",
    tilesets: "tilesets",
    timelines: "timelines"
});

export type ProjectMetadataSchemaName = keyof typeof Yy.schemas;

function mapResourceTypeToSchemaName(resourceType: unknown): ProjectMetadataSchemaName | null {
    if (!Core.isNonEmptyTrimmedString(resourceType)) {
        return null;
    }

    const schemaName = RESOURCE_TYPE_TO_SCHEMA_NAME[resourceType];
    return schemaName ?? null;
}

function mapResourcePathToSchemaName(sourcePath: string): ProjectMetadataSchemaName | null {
    const normalizedPath = Core.toPosixPath(sourcePath);
    if (normalizedPath.toLowerCase().endsWith(".yyp")) {
        return "project";
    }

    const segments = Core.trimStringEntries(normalizedPath.split("/"));
    if (segments.length === 0) {
        return null;
    }

    const fileName = segments.at(-1);
    if (!fileName || !fileName.toLowerCase().endsWith(".yy")) {
        return null;
    }

    const folderSegment = segments[0].toLowerCase();
    const schemaName = RESOURCE_FOLDER_TO_SCHEMA_NAME[folderSegment];
    return schemaName ?? null;
}

/**
 * Resolve the best available @bscotch/yy schema name for a metadata document.
 */
export function resolveProjectMetadataSchemaName(
    sourcePath: string,
    resourceType: unknown = null
): ProjectMetadataSchemaName | null {
    return mapResourceTypeToSchemaName(resourceType) ?? mapResourcePathToSchemaName(sourcePath);
}

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
 * Parse metadata and infer a schema name from its resourceType/path.
 */
export function parseProjectMetadataDocumentWithSchema(rawContents: string, sourcePath: string) {
    const document = parseProjectMetadataDocument(rawContents, sourcePath);
    const schemaName = resolveProjectMetadataSchemaName(sourcePath, document.resourceType);

    return {
        document,
        schemaName
    };
}

/**
 * Stringify a metadata payload using Stitch's yy serializer.
 */
export function stringifyProjectMetadataDocument(document: Record<string, unknown>) {
    return Yy.stringify(document);
}
