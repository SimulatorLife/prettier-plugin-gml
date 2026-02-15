import { Core, type ProjectAnalysisSnapshot } from "@gml-modules/core";

import type { RefactorProjectAnalysisContext, RefactorProjectAnalysisProvider } from "./types.js";

async function listSemanticOccurrencePaths(
    identifierName: string,
    context: RefactorProjectAnalysisContext
): Promise<ReadonlySet<string>> {
    const files = new Set<string>();
    if (!context.semantic) {
        return files;
    }

    const occurrences = await context.semantic.getSymbolOccurrences?.(identifierName);
    if (!Array.isArray(occurrences)) {
        return files;
    }

    for (const occurrence of occurrences) {
        if (Core.isObjectLike(occurrence) && Core.isNonEmptyString(occurrence.path)) {
            files.add(occurrence.path);
        }
    }

    return files;
}

async function createSemanticSnapshot(
    identifierNames: ReadonlyArray<string>,
    context: RefactorProjectAnalysisContext
): Promise<ProjectAnalysisSnapshot> {
    const identifierToFiles = new Map<string, ReadonlySet<string>>();
    await Core.runSequentially(identifierNames, async (identifierName) => {
        const files = await listSemanticOccurrencePaths(identifierName, context);
        if (files.size > 0) {
            identifierToFiles.set(identifierName.trim().toLowerCase(), files);
        }
    });

    return Core.createProjectAnalysisSnapshotFromIndex(identifierToFiles);
}

/**
 * Creates the default project analysis provider for RefactorEngine overlap checks.
 */
export function createRefactorProjectAnalysisProvider(): RefactorProjectAnalysisProvider {
    return Object.freeze({
        async isIdentifierOccupied(identifierName: string, context: RefactorProjectAnalysisContext): Promise<boolean> {
            const snapshot = await createSemanticSnapshot([identifierName], context);
            return snapshot.isIdentifierNameOccupiedInProject(identifierName);
        },
        async listIdentifierOccurrences(
            identifierName: string,
            context: RefactorProjectAnalysisContext
        ): Promise<Set<string>> {
            const snapshot = await createSemanticSnapshot([identifierName], context);
            return new Set(snapshot.listIdentifierOccurrenceFiles(identifierName));
        },
        async planFeatherRenames(
            requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>,
            _filePath: string | null,
            _projectRoot: string,
            context: RefactorProjectAnalysisContext
        ): Promise<
            Array<{
                identifierName: string;
                mode: "local-fallback" | "project-aware";
                preferredReplacementName: string;
                replacementName: string | null;
                skipReason?: string;
            }>
        > {
            const analyzedNames = requests.flatMap((request) => [
                request.identifierName,
                request.preferredReplacementName
            ]);
            const snapshot = await createSemanticSnapshot(analyzedNames, context);
            const planned = snapshot.planIdentifierRenames(requests);

            return planned.map((entry) => {
                const translatedEntry = {
                    identifierName: entry.identifierName,
                    mode: "project-aware" as const,
                    preferredReplacementName: entry.preferredReplacementName,
                    replacementName: entry.safe ? entry.preferredReplacementName : null
                };
                if (entry.reason) {
                    return {
                        ...translatedEntry,
                        skipReason: entry.reason
                    };
                }

                return translatedEntry;
            });
        },
        assessGlobalVarRewrite(
            filePath: string | null,
            hasInitializer: boolean
        ): {
            allowRewrite: boolean;
            initializerMode: "existing" | "undefined";
            mode: "project-aware";
        } {
            const assessment = Core.createProjectAnalysisSnapshotFromIndex(new Map()).assessGlobalVarRewrite(
                filePath,
                hasInitializer
            );
            return {
                allowRewrite: assessment.allowRewrite,
                initializerMode: hasInitializer ? "existing" : "undefined",
                mode: "project-aware"
            };
        },
        resolveLoopHoistIdentifier(preferredName: string): {
            identifierName: string;
            mode: "project-aware";
        } {
            const snapshot = Core.createProjectAnalysisSnapshotFromIndex(new Map());
            const resolvedIdentifierName = snapshot.resolveLoopHoistIdentifier(preferredName, new Set());
            return {
                identifierName: resolvedIdentifierName ?? preferredName,
                mode: "project-aware"
            };
        }
    });
}
