import { Core } from "@gml-modules/core";

import { type FeatherRenameResolution, resolveFeatherRename } from "../../runtime/index.js";

export type FeatherTransformFormattingOptions = Record<string, unknown> | null | undefined;

export function resolveFormatterFilePathForFeather(options: FeatherTransformFormattingOptions): string | null {
    if (!options) {
        return null;
    }

    const filePathCandidate = options.filepath;
    return Core.isNonEmptyString(filePathCandidate) ? filePathCandidate : null;
}

export function collectIdentifierNamesFromNode(root: unknown): Set<string> {
    const identifierNames = new Set<string>();

    const visit = (node: unknown): void => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (Array.isArray(node)) {
            for (const value of node) {
                visit(value);
            }
            return;
        }

        const nodeRecord = node as { type?: unknown; name?: unknown };
        if (nodeRecord.type === "Identifier" && Core.isNonEmptyString(nodeRecord.name)) {
            identifierNames.add(nodeRecord.name);
        }

        Core.forEachNodeChild(node, (child) => {
            visit(child);
        });
    };

    visit(root);
    return identifierNames;
}

export function resolveSemanticSafeFeatherRename({
    formattingOptions,
    identifierName,
    localIdentifierNames,
    preferredReplacementName
}: {
    formattingOptions: FeatherTransformFormattingOptions;
    identifierName: string;
    localIdentifierNames: ReadonlySet<string>;
    preferredReplacementName: string;
}): FeatherRenameResolution | null {
    return resolveFeatherRename(
        {
            filePath: resolveFormatterFilePathForFeather(formattingOptions),
            identifierName,
            localIdentifierNames,
            preferredReplacementName
        },
        formattingOptions
    );
}
