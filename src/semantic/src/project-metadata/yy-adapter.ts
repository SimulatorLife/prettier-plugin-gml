import fs from "node:fs";

import { Yy } from "@bscotch/yy";
import { Core } from "@gml-modules/core";

const PROJECT_METADATA_PARSE_ERROR = "ProjectMetadataParseError";
const PROJECT_METADATA_SCHEMA_VALIDATION_ERROR = "ProjectMetadataSchemaValidationError";

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

export type ProjectMetadataSchemaName = keyof typeof Yy.schemas;

const PROJECT_METADATA_SCHEMA_NAMES: ReadonlySet<ProjectMetadataSchemaName> = Object.freeze(
    new Set(Object.keys(Yy.schemas) as Array<ProjectMetadataSchemaName>)
);

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

    if (!normalizedPath.toLowerCase().endsWith(".yy")) {
        return null;
    }

    const segments = Core.trimStringEntries(normalizedPath.split("/"));
    if (segments.length < 2) {
        return null;
    }

    const directorySegments = segments.slice(0, -1);
    for (let index = directorySegments.length - 1; index >= 0; index -= 1) {
        const candidate = directorySegments[index]?.toLowerCase() as ProjectMetadataSchemaName | undefined;
        if (candidate && PROJECT_METADATA_SCHEMA_NAMES.has(candidate)) {
            return candidate;
        }
    }

    return null;
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
        this.cause = Core.isErrorLike(cause) ? cause : undefined;
    }
}

/**
 * Error raised when metadata fails validation against an inferred yy schema.
 */
export class ProjectMetadataSchemaValidationError extends Error {
    constructor(sourcePath: string, schemaName: string, cause: unknown) {
        const details = Core.getErrorMessageOrFallback(cause);
        super(
            `Metadata at '${sourcePath}' does not match inferred '${schemaName}' schema required for safe mutation: ${details}`
        );
        this.name = PROJECT_METADATA_SCHEMA_VALIDATION_ERROR;
        this.cause = Core.isErrorLike(cause) ? cause : undefined;
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
 * Type guard for {@link ProjectMetadataSchemaValidationError}.
 */
export function isProjectMetadataSchemaValidationError(value: unknown): value is ProjectMetadataSchemaValidationError {
    return (
        value instanceof ProjectMetadataSchemaValidationError ||
        Core.getNonEmptyString((value as { name?: string })?.name) === PROJECT_METADATA_SCHEMA_VALIDATION_ERROR
    );
}

function assertProjectMetadataDocumentIsPlainObject(parsed: unknown, sourcePath: string) {
    return Core.assertPlainObject(parsed, {
        errorMessage: `Resource JSON at ${sourcePath} must be a plain object.`
    });
}

function checkProjectMetadataDocumentSchema(
    rawContents: string,
    sourcePath: string,
    schemaName: ProjectMetadataSchemaName | null
): { schemaValidated: boolean; document: Record<string, unknown>; schemaError: unknown } {
    if (!schemaName) {
        return {
            schemaValidated: false,
            document: parseProjectMetadataDocument(rawContents, sourcePath),
            schemaError: null
        };
    }

    try {
        const schemaParsed = Yy.parse(rawContents, schemaName);
        return {
            schemaValidated: true,
            document: assertProjectMetadataDocumentIsPlainObject(schemaParsed, sourcePath),
            schemaError: null
        };
    } catch (error) {
        return {
            schemaValidated: false,
            document: parseProjectMetadataDocument(rawContents, sourcePath),
            schemaError: error
        };
    }
}

function readProjectMetadataDocumentFromFileWithoutSchema(sourcePath: string): Record<string, unknown> {
    let parsed: unknown;
    try {
        parsed = Yy.readSync(sourcePath);
    } catch (error) {
        throw new ProjectMetadataParseError(sourcePath, error);
    }

    return assertProjectMetadataDocumentIsPlainObject(parsed, sourcePath);
}

function checkProjectMetadataDocumentSchemaFromFile(
    sourcePath: string,
    schemaName: ProjectMetadataSchemaName | null
): { schemaValidated: boolean; document: Record<string, unknown>; schemaError: unknown } {
    if (!schemaName) {
        return {
            schemaValidated: false,
            document: readProjectMetadataDocumentFromFileWithoutSchema(sourcePath),
            schemaError: null
        };
    }

    try {
        const schemaParsed = Yy.readSync(sourcePath, schemaName);
        return {
            schemaValidated: true,
            document: assertProjectMetadataDocumentIsPlainObject(schemaParsed, sourcePath),
            schemaError: null
        };
    } catch (error) {
        return {
            schemaValidated: false,
            document: readProjectMetadataDocumentFromFileWithoutSchema(sourcePath),
            schemaError: error
        };
    }
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

    return assertProjectMetadataDocumentIsPlainObject(parsed, sourcePath);
}

/**
 * Parse metadata, infer a schema name from resourceType/path, and report whether
 * the parsed payload matches the inferred schema.
 */
export function parseProjectMetadataDocumentWithSchema(rawContents: string, sourcePath: string) {
    const pathDerivedSchemaName = resolveProjectMetadataSchemaName(sourcePath);
    const pathDerivedSchemaResult = checkProjectMetadataDocumentSchema(rawContents, sourcePath, pathDerivedSchemaName);
    if (pathDerivedSchemaResult.schemaValidated) {
        return {
            document: pathDerivedSchemaResult.document,
            schemaName: pathDerivedSchemaName,
            schemaValidated: true,
            schemaError: null
        };
    }

    const fallbackDocument = pathDerivedSchemaResult.document;
    const schemaName = resolveProjectMetadataSchemaName(sourcePath, fallbackDocument.resourceType);
    if (!schemaName || schemaName === pathDerivedSchemaName) {
        return {
            document: fallbackDocument,
            schemaName,
            schemaValidated: false,
            schemaError: pathDerivedSchemaResult.schemaError
        };
    }

    const schemaResult = checkProjectMetadataDocumentSchema(rawContents, sourcePath, schemaName);

    return {
        document: schemaResult.document,
        schemaName,
        schemaValidated: schemaResult.schemaValidated,
        schemaError: schemaResult.schemaError
    };
}

/**
 * Parse metadata for mutation workflows, enforcing inferred schema validation
 * whenever a concrete schema can be derived from file path or resource type.
 */
export function parseProjectMetadataDocumentForMutation(rawContents: string, sourcePath: string) {
    const parsed = parseProjectMetadataDocumentWithSchema(rawContents, sourcePath);
    const requiresStrictValidation = parsed.schemaName && parsed.schemaName !== "project";
    if (requiresStrictValidation && !parsed.schemaValidated) {
        throw new ProjectMetadataSchemaValidationError(sourcePath, parsed.schemaName, parsed.schemaError);
    }

    return parsed;
}

/**
 * Stringify a metadata payload using Stitch's yy serializer.
 */
export function stringifyProjectMetadataDocument(document: Record<string, unknown>, sourcePath = "") {
    const schemaName = Core.isNonEmptyString(sourcePath)
        ? resolveProjectMetadataSchemaName(sourcePath, document.resourceType)
        : null;

    if (schemaName) {
        try {
            return Yy.stringify(document, schemaName);
        } catch {
            return Yy.stringify(document);
        }
    }

    return Yy.stringify(document);
}

/**
 * Read and parse a GameMaker metadata file from disk.
 *
 * When a schema can be inferred from path/resourceType, this uses
 * schema-aware `Yy.readSync` parsing first and reports schema validation
 * status in the same shape as {@link parseProjectMetadataDocumentWithSchema}.
 */
export function readProjectMetadataDocumentFromFile(sourcePath: string) {
    const pathDerivedSchemaName = resolveProjectMetadataSchemaName(sourcePath);
    const pathDerivedSchemaResult = checkProjectMetadataDocumentSchemaFromFile(sourcePath, pathDerivedSchemaName);
    if (pathDerivedSchemaResult.schemaValidated) {
        return {
            document: pathDerivedSchemaResult.document,
            schemaName: pathDerivedSchemaName,
            schemaValidated: true,
            schemaError: null
        };
    }

    const fallbackDocument = pathDerivedSchemaResult.document;
    const schemaName = resolveProjectMetadataSchemaName(sourcePath, fallbackDocument.resourceType);
    if (!schemaName || schemaName === pathDerivedSchemaName) {
        return {
            document: fallbackDocument,
            schemaName,
            schemaValidated: false,
            schemaError: pathDerivedSchemaResult.schemaError
        };
    }

    const schemaResult = checkProjectMetadataDocumentSchemaFromFile(sourcePath, schemaName);
    return {
        document: schemaResult.document,
        schemaName,
        schemaValidated: schemaResult.schemaValidated,
        schemaError: schemaResult.schemaError
    };
}

/**
 * Read metadata from disk for mutation workflows, enforcing schema validity
 * through the same strict policy as {@link parseProjectMetadataDocumentForMutation}.
 */
export function readProjectMetadataDocumentForMutationFromFile(sourcePath: string) {
    const parsed = readProjectMetadataDocumentFromFile(sourcePath);
    const requiresStrictValidation = parsed.schemaName && parsed.schemaName !== "project";
    if (requiresStrictValidation && !parsed.schemaValidated) {
        throw new ProjectMetadataSchemaValidationError(sourcePath, parsed.schemaName, parsed.schemaError);
    }

    return parsed;
}

/**
 * Write a metadata document to disk using `@bscotch/yy` as the primary writer.
 *
 * Returns `true` when bytes were written and `false` when `Yy.writeSync`
 * short-circuits because no file content changed.
 */
export function writeProjectMetadataDocumentToFile(sourcePath: string, document: Record<string, unknown>): boolean {
    const schemaName = resolveProjectMetadataSchemaName(sourcePath, document.resourceType);
    try {
        return Yy.writeSync(sourcePath, document, schemaName ?? undefined);
    } catch {
        fs.writeFileSync(sourcePath, stringifyProjectMetadataDocument(document, sourcePath), "utf8");
    }

    return true;
}

function resolveProjectMetadataPathTarget(
    document: Record<string, unknown>,
    propertyPath: string
): {
    container: Record<string, unknown> | Array<unknown>;
    key: string | number;
    value: unknown;
} | null {
    const segments = Core.trimStringEntries(propertyPath.split(".")).filter((segment) => segment.length > 0);
    if (segments.length === 0) {
        return null;
    }

    let current: unknown = document;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const isLast = index === segments.length - 1;

        if (Array.isArray(current)) {
            const arrayIndex = Number(segment);
            if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= current.length) {
                return null;
            }

            if (isLast) {
                return {
                    container: current,
                    key: arrayIndex,
                    value: current[arrayIndex]
                };
            }

            current = current[arrayIndex];
            continue;
        }

        if (!Core.isObjectLike(current)) {
            return null;
        }

        const objectRecord = current as Record<string, unknown>;
        if (!Object.hasOwn(objectRecord, segment)) {
            return null;
        }

        if (isLast) {
            return {
                container: objectRecord,
                key: segment,
                value: objectRecord[segment]
            };
        }

        current = objectRecord[segment];
    }

    return null;
}

/**
 * Resolve a nested value from parsed metadata by property path.
 */
export function getProjectMetadataValueAtPath(document: Record<string, unknown>, propertyPath: string): unknown {
    if (!Core.isNonEmptyString(propertyPath)) {
        return document;
    }

    const target = resolveProjectMetadataPathTarget(document, propertyPath);
    return target ? target.value : null;
}

/**
 * Update a metadata reference at a property path.
 *
 * Supports both object references (`{ name, path }`) and direct string path fields.
 */
export function updateProjectMetadataReferenceByPath({
    document,
    propertyPath,
    newResourcePath,
    newName
}: {
    document: Record<string, unknown>;
    propertyPath: string;
    newResourcePath: string | null;
    newName: string | null;
}): boolean {
    if (!Core.isNonEmptyString(propertyPath) || !Core.isObjectLike(document)) {
        return false;
    }

    const target = resolveProjectMetadataPathTarget(document, propertyPath);
    if (!target) {
        return false;
    }

    if (Core.isObjectLike(target.value)) {
        const targetRecord = target.value as Record<string, unknown>;
        let changed = false;

        if (Core.isNonEmptyString(newResourcePath) && targetRecord.path !== newResourcePath) {
            targetRecord.path = newResourcePath;
            changed = true;
        }

        if (Core.isNonEmptyString(newName) && targetRecord.name !== newName) {
            targetRecord.name = newName;
            changed = true;
        }

        return changed;
    }

    if (
        typeof target.value === "string" &&
        Core.isNonEmptyString(newResourcePath) &&
        target.value !== newResourcePath
    ) {
        if (Array.isArray(target.container)) {
            target.container[target.key as number] = newResourcePath;
        } else {
            target.container[target.key as string] = newResourcePath;
        }
        return true;
    }

    return false;
}
