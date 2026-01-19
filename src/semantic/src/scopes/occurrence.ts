import { Core, type GameMakerAstNode } from "@gml-modules/core";

import type { Location, Occurrence, ScopeSymbolMetadata } from "./types.js";

/**
 * Creates a new occurrence object for a symbol declaration or reference.
 */
export function createOccurrence(
    kind: "declaration" | "reference",
    metadata: { name?: string | null; scopeId?: string | null; classifications?: Iterable<string | undefined | null> },
    source: GameMakerAstNode | null | undefined,
    declarationMetadata: ScopeSymbolMetadata | null | undefined
): Occurrence {
    const declaration = declarationMetadata
        ? Core.assignClonedLocation({ scopeId: declarationMetadata.scopeId }, declarationMetadata)
        : null;

    const usageContext = kind === "declaration" ? null : extractUsageContext(source);

    const baseOccurrence = {
        kind,
        name: metadata.name ?? null,
        scopeId: metadata.scopeId ?? null,
        classifications: Core.toMutableArray(metadata.classifications, {
            clone: true
        }) as string[],
        declaration,
        usageContext
    } as any;

    return Core.assignClonedLocation(baseOccurrence, source ?? {}) as Occurrence;
}

/**
 * Extracts usage context (read/write/call) from an AST node.
 */
export function extractUsageContext(node: unknown): Occurrence["usageContext"] {
    if (!Core.isObjectLike(node)) {
        return null;
    }

    const context: NonNullable<Occurrence["usageContext"]> = {};
    const nodeAny = node as Record<string, any>;

    if (nodeAny.isAssignmentTarget === true) {
        context.isAssignmentTarget = true;
        context.isWrite = true;
    }

    if (nodeAny.isCallTarget === true) {
        context.isCallTarget = true;
        context.isRead = true;
    }

    if (typeof nodeAny.parentType === "string") {
        context.parentType = nodeAny.parentType;
    }

    if (!context.isWrite && !context.isRead) {
        context.isRead = true;
    }

    return Object.keys(context).length > 0 ? context : null;
}

/**
 * Clones declaration metadata for caching or transfer.
 */
export function cloneDeclarationMetadata(metadata: ScopeSymbolMetadata | null | undefined): ScopeSymbolMetadata | null {
    if (!metadata) {
        return null;
    }

    return {
        name: metadata.name,
        scopeId: metadata.scopeId,
        classifications: Core.toMutableArray(metadata.classifications, { clone: true }),
        start: Core.cloneLocation(metadata.start),
        end: Core.cloneLocation(metadata.end)
    } as ScopeSymbolMetadata;
}

/**
 * Clones an occurrence object.
 */
export function cloneOccurrence(occurrence: Occurrence | null | undefined): Occurrence | null {
    if (!occurrence) {
        return null;
    }

    const declarationClone = occurrence.declaration
        ? {
              scopeId: occurrence.declaration.scopeId,
              start: Core.cloneLocation(occurrence.declaration.start),
              end: Core.cloneLocation(occurrence.declaration.end)
          }
        : null;

    const usageContextClone = occurrence.usageContext ? { ...occurrence.usageContext } : null;

    return {
        ...occurrence,
        classifications: Core.toMutableArray(occurrence.classifications, { clone: true }),
        declaration: declarationClone,
        usageContext: usageContextClone,
        start: Core.cloneLocation(occurrence.start),
        end: Core.cloneLocation(occurrence.end)
    } as Occurrence;
}

/**
 * Build a `{ start, end }` location object from a token, preserving `line`, `index`,
 * and optional `column` data. Returns `null` if no token is provided.
 */
export function createIdentifierLocation(token: any): Location | null {
    if (!token) {
        return null;
    }

    const { line } = token as { line: number };
    const startIndex = (token.start ?? token.startIndex) as number | undefined;
    const stopIndex = (token.stop ?? token.stopIndex ?? startIndex) as number | undefined;
    const startColumn = token.column as number | undefined;
    const identifierLength =
        Number.isInteger(startIndex) && Number.isInteger(stopIndex)
            ? (stopIndex ?? 0) - (startIndex ?? 0) + 1
            : undefined;

    const buildPoint = (index: number | undefined, column?: number): Location["start"] => {
        const point: any = {
            line,
            index: index ?? 0
        };
        if (column !== undefined) {
            point.column = column;
        }

        return point;
    };

    return {
        start: buildPoint(startIndex, startColumn),
        end: buildPoint(
            stopIndex === undefined ? undefined : stopIndex + 1,
            startColumn !== undefined && identifierLength !== undefined ? startColumn + identifierLength : undefined
        )
    };
}
