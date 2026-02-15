import { Core } from "@gml-modules/core";
import { Parser } from "@gml-modules/parser";

type FeatherRenamePlanRequest = Readonly<{
    identifierName: string;
    preferredReplacementName: string;
}>;

type FeatherRenameResolution = Readonly<{
    identifierName: string;
    mode: "local-fallback";
    replacementName: string;
}>;

const RESERVED_IDENTIFIER_NAMES = Core.loadReservedIdentifierNames();

export function prepareFeatherRenamePlanningForFormat(
    sourceText: string,
    _options: Record<string, unknown>
): Map<string, FeatherRenameResolution | null> | null {
    const requests = collectReservedIdentifierRenameRequests(sourceText);
    if (requests.length === 0) {
        return null;
    }

    const plan = new Map<string, FeatherRenameResolution | null>();
    const localNames = new Set<string>(requests.map((request) => request.identifierName.toLowerCase()));
    for (const request of requests) {
        const normalizedPreferred = request.preferredReplacementName.toLowerCase();
        if (localNames.has(normalizedPreferred)) {
            plan.set(request.identifierName, null);
            continue;
        }

        plan.set(request.identifierName, {
            identifierName: request.identifierName,
            mode: "local-fallback",
            replacementName: request.preferredReplacementName
        });
    }

    return plan;
}

function collectReservedIdentifierRenameRequests(sourceText: string): Array<FeatherRenamePlanRequest> {
    if (!Core.isNonEmptyString(sourceText)) {
        return [];
    }

    let ast: unknown;
    try {
        ast = Parser.GMLParser.parse(sourceText, {
            getLocations: true,
            simplifyLocations: false
        });
    } catch {
        return [];
    }

    const requests = new Map<string, FeatherRenamePlanRequest>();
    const visit = (node: unknown): void => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                visit(child);
            }
            return;
        }

        if (isNodeObject(node) && node.type === "MacroDeclaration") {
            const identifier = (node as { name?: unknown }).name;
            if (isIdentifierNode(identifier) && isReservedIdentifier(identifier.name)) {
                setRequest(requests, identifier.name);
            }
        }

        if (isNodeObject(node) && node.type === "VariableDeclaration") {
            const declarationNode = node as { declarations?: unknown; kind?: unknown };
            const kind =
                typeof declarationNode.kind === "string" ? Core.toNormalizedLowerCaseString(declarationNode.kind) : "";
            if (kind === "var" || kind === "static") {
                for (const declaration of Core.asArray(declarationNode.declarations)) {
                    const identifier = isNodeObject(declaration) ? declaration.id : null;
                    if (isIdentifierNode(identifier) && isReservedIdentifier(identifier.name)) {
                        setRequest(requests, identifier.name);
                    }
                }
            }
        }

        Core.forEachNodeChild(node, (child) => {
            visit(child);
        });
    };

    visit(ast);
    return [...requests.values()];
}

function isNodeObject(candidate: unknown): candidate is Record<string, unknown> {
    return Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate);
}

function isIdentifierNode(candidate: unknown): candidate is { type: "Identifier"; name: string } {
    return isNodeObject(candidate) && candidate.type === "Identifier" && Core.isNonEmptyString(candidate.name);
}

function setRequest(requests: Map<string, FeatherRenamePlanRequest>, identifierName: string): void {
    if (!Core.isNonEmptyString(identifierName) || requests.has(identifierName)) {
        return;
    }

    requests.set(identifierName, {
        identifierName,
        preferredReplacementName: buildPreferredReplacementName(identifierName)
    });
}

function buildPreferredReplacementName(identifierName: string): string {
    let candidate = `__featherFix_${identifierName}`;
    const seen = new Set<string>();

    while (isReservedIdentifier(candidate)) {
        if (seen.has(candidate)) {
            return `__featherFix_${identifierName}_safe`;
        }
        seen.add(candidate);
        candidate = `_${candidate}`;
    }

    return candidate;
}

function isReservedIdentifier(name: unknown): boolean {
    if (!Core.isNonEmptyString(name)) {
        return false;
    }

    const normalizedName = name.toLowerCase();
    if (!RESERVED_IDENTIFIER_NAMES.has(normalizedName)) {
        return false;
    }

    try {
        const metadata = Core.getIdentifierMetadata();
        const identifiers = metadata?.identifiers;
        if (!identifiers || typeof identifiers !== "object") {
            return false;
        }
        return Object.hasOwn(identifiers, name);
    } catch {
        return false;
    }
}
