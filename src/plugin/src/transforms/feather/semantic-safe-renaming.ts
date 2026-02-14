import { Core } from "@gml-modules/core";

export type FeatherRenameResolution = Readonly<{
    identifierName: string;
    mode: "local-fallback";
    replacementName: string;
}>;

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
    identifierName,
    localIdentifierNames,
    preferredReplacementName
}: {
    formattingOptions: FeatherTransformFormattingOptions;
    identifierName: string;
    localIdentifierNames: ReadonlySet<string>;
    preferredReplacementName: string;
}): FeatherRenameResolution | null {
    const normalizedLocalNames = new Set(Array.from(localIdentifierNames, (name) => name.toLowerCase()));
    const normalizedPreferredName = preferredReplacementName.toLowerCase();
    if (normalizedLocalNames.has(normalizedPreferredName)) {
        return null;
    }

    return {
        identifierName,
        mode: "local-fallback",
        replacementName: preferredReplacementName
    };
}
