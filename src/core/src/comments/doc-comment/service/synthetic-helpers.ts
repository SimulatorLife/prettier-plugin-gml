import { getIdentifierText, isUndefinedSentinel } from "../../../ast/node-helpers.js";
import { getNodeEndIndex, getNodeStartIndex } from "../../../ast/locations.js";
import { getNonEmptyString, isNonEmptyTrimmedString } from "../../../utils/string.js";
import { normalizeDocMetadataName } from "./params.js";

const STRING_TYPE = "string";
const NUMBER_TYPE = "number";
export const suppressedImplicitDocCanonicalByNode = new WeakMap<any, Set<string>>();
export const preferredParamDocNamesByNode = new WeakMap<any, Map<number, string>>();

export interface SyntheticDocGenerationOptions {
    originalText?: string | null;
    locStart?: ((node: any) => number) | null;
    locEnd?: ((node: any) => number) | null;
    optimizeLoopLengthHoisting?: boolean;
    [key: string]: any;
}

function getNormalizedParameterName(paramNode: any) {
    if (!paramNode) {
        return null;
    }

    const rawName = getIdentifierText(paramNode);
    if (typeof rawName !== STRING_TYPE || rawName.length === 0) {
        return null;
    }

    const normalizedName = normalizeDocMetadataName(rawName);
    return getNonEmptyString(normalizedName);
}

export function getIdentifierFromParameterNode(param: any) {
    if (!param || typeof param !== "object") {
        return null;
    }

    if (param.type === "Identifier") {
        return param;
    }

    if (param.type === "DefaultParameter" && param.left?.type === "Identifier") {
        return param.left;
    }

    return null;
}

export function getArgumentIndexFromIdentifier(name: unknown) {
    if (typeof name !== STRING_TYPE) {
        return null;
    }

    const match = (name as string).match(/^argument([0-9]+)$/);
    if (match) {
        return Number.parseInt(match[1], 10);
    }
    return null;
}

function getArgumentIndexFromNode(node: any) {
    if (!node) {
        return null;
    }

    if (node.type === "Identifier") {
        return getArgumentIndexFromIdentifier(node.name);
    }

    if (
        node.type === "MemberIndexExpression" &&
        node.object?.type === "Identifier" &&
        node.object.name === "argument" &&
        Array.isArray(node.property) &&
        node.property.length === 1 &&
        node.property[0]?.type === "Literal"
    ) {
        const literal = node.property[0];
        const parsed = Number.parseInt(literal.value, 10);
        return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }

    if (
        node.type === "MemberExpression" &&
        node.object?.type === "Identifier" &&
        node.object.name === "argument" &&
        node.property?.type === "Literal" &&
        typeof node.property.value === NUMBER_TYPE
    ) {
        return node.property.value;
    }

    // console.log("DEBUG: getArgumentIndexFromNode unknown type", node.type);

    return null;
}

export function getSourceTextForNode(node: any, options: SyntheticDocGenerationOptions) {
    if (!node) {
        return null;
    }

    const { originalText, locStart, locEnd } = options;

    if (typeof originalText !== STRING_TYPE) {
        return null;
    }

    const startIndex = typeof locStart === "function" ? locStart(node) : getNodeStartIndex(node);
    const endIndex = typeof locEnd === "function" ? locEnd(node) : getNodeEndIndex(node);

    if (
        typeof startIndex !== NUMBER_TYPE ||
        typeof endIndex !== NUMBER_TYPE ||
        startIndex < 0 ||
        endIndex <= startIndex ||
        endIndex > originalText.length
    ) {
        return null;
    }

    return originalText.slice(startIndex, endIndex);
}

export function shouldOmitUndefinedDefaultForFunctionNode(functionNode: any) {
    if (!functionNode || !functionNode.type) {
        return false;
    }

    if (functionNode.type === "ConstructorDeclaration" || functionNode.type === "ConstructorParentClause") {
        return false;
    }

    return functionNode.type === "FunctionDeclaration";
}

export function getParameterDocInfo(paramNode: any, functionNode: any, options: SyntheticDocGenerationOptions) {
    if (!paramNode) {
        return null;
    }

    if (paramNode.type === "Identifier") {
        const name = getNormalizedParameterName(paramNode);
        return name
            ? {
                  name,
                  optional: false,
                  optionalOverride: false,
                  explicitUndefinedDefault: false
              }
            : null;
    }

    if (paramNode.type === "VariableDeclarator") {
        const name = getNormalizedParameterName(paramNode.id);
        return name
            ? {
                  name,
                  optional: false,
                  optionalOverride: false,
                  explicitUndefinedDefault: false
              }
            : null;
    }

    if (paramNode.type === "DefaultParameter") {
        if (paramNode.right == null) {
            const name = getNormalizedParameterName(paramNode.left);
            return name
                ? {
                      name,
                      optional: false,
                      optionalOverride: false,
                      explicitUndefinedDefault: false
                  }
                : null;
        }

        const name = getNormalizedParameterName(paramNode.left);
        if (!name) {
            return null;
        }

        const defaultIsUndefined = isUndefinedSentinel(paramNode.right);
        const signatureOmitsUndefinedDefault =
            defaultIsUndefined && shouldOmitUndefinedDefaultForFunctionNode(functionNode);
        const isConstructorLike =
            functionNode?.type === "ConstructorDeclaration" || functionNode?.type === "ConstructorParentClause";

        const shouldIncludeDefaultText = !defaultIsUndefined || (!signatureOmitsUndefinedDefault && !isConstructorLike);

        const defaultText = shouldIncludeDefaultText ? getSourceTextForNode(paramNode.right, options) : null;

        const docName = defaultText ? `${name}=${defaultText}` : name;

        const optionalOverride = paramNode?._featherOptionalParameter === true;
        const searchName = getNormalizedParameterName(paramNode.left ?? paramNode);
        const explicitUndefinedDefaultFromSource =
            defaultIsUndefined &&
            typeof searchName === STRING_TYPE &&
            searchName.length > 0 &&
            typeof options?.originalText === STRING_TYPE &&
            options.originalText.includes(`${searchName} = undefined`);

        const optional = defaultIsUndefined ? (isConstructorLike ? true : optionalOverride) : true;

        return {
            name: docName,
            optional,
            optionalOverride,
            explicitUndefinedDefault: explicitUndefinedDefaultFromSource
        };
    }

    if (paramNode.type === "MissingOptionalArgument") {
        return null;
    }

    const fallbackName = getNormalizedParameterName(paramNode);
    return fallbackName
        ? {
              name: fallbackName,
              optional: false,
              optionalOverride: false,
              explicitUndefinedDefault: false
          }
        : null;
}

export function gatherImplicitArgumentReferences(functionNode: any) {
    const referencedIndices = new Set<number>();
    const aliasByIndex = new Map<number, string>();
    const directReferenceIndices = new Set<number>();

    const visit = (node: any, parent: any) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (node === functionNode) {
            if (functionNode.body) {
                visit(functionNode.body, node);
            }
            return;
        }

        if (Array.isArray(node)) {
            for (const element of node) {
                visit(element, parent);
            }
            return;
        }

        if (
            node !== functionNode &&
            (node.type === "FunctionDeclaration" ||
                node.type === "StructFunctionDeclaration" ||
                node.type === "FunctionExpression" ||
                node.type === "ConstructorDeclaration")
        ) {
            return;
        }

        if (node.type === "VariableDeclarator") {
            const aliasIndex = getArgumentIndexFromNode(node.init);
            if (aliasIndex !== null && node.id?.type === "Identifier" && !aliasByIndex.has(aliasIndex)) {
                const aliasName = normalizeDocMetadataName(node.id.name);
                if (isNonEmptyTrimmedString(aliasName)) {
                    aliasByIndex.set(aliasIndex, aliasName);
                    referencedIndices.add(aliasIndex);
                }
            }
        }

        const directIndex = getArgumentIndexFromNode(node);
        if (directIndex !== null) {
            referencedIndices.add(directIndex);
            if (parent?.type === "VariableDeclarator" && parent.init === node && aliasByIndex.has(directIndex)) {
                // Skip adding to directReferenceIndices when this argument reference
                // is on the right side of a variable declarator that defines an alias
                // for the same argument index. This prevents the synthetic doc comment
                // logic from treating `var alias = argument0` as a "direct" usage of
                // the argument, since the alias definition itself was already recorded
                // above and represents the canonical name for that parameter slot.
                // Including both would lead to duplicate or conflicting @param entries.
            } else {
                directReferenceIndices.add(directIndex);
            }
        }

        for (const key in node) {
            if (key === "parent" || key === "enclosingNode" || key === "precedingNode" || key === "followingNode")
                continue;
            const child = node[key];
            if (typeof child === "object" && child !== null) {
                visit(child, node);
            }
        }
    };

    visit(functionNode, null);

    return { referencedIndices, aliasByIndex, directReferenceIndices };
}

export type ImplicitArgumentDocEntry = {
    name?: string | null;
    canonical?: string | null;
    fallbackCanonical?: string | null;
    index?: number;
    hasDirectReference?: boolean;
    _suppressDocLine?: boolean;
};

export function collectImplicitArgumentDocNames(
    functionNode: any,
    options: SyntheticDocGenerationOptions
): ImplicitArgumentDocEntry[] {
    if (
        !functionNode ||
        (functionNode.type !== "FunctionDeclaration" &&
            functionNode.type !== "StructFunctionDeclaration" &&
            functionNode.type !== "FunctionExpression")
    ) {
        return [];
    }

    if (options.applyFeatherFixes !== false && Array.isArray(functionNode._featherImplicitArgumentDocEntries)) {
        const entries = functionNode._featherImplicitArgumentDocEntries as ImplicitArgumentDocEntry[];
        const suppressedCanonicals = suppressedImplicitDocCanonicalByNode.get(functionNode);

        processImplicitArgumentEntries(functionNode, entries);

        return entries.filter((entry: any) => {
            if (!entry) return false;
            if (entry._suppressDocLine) {
                return false;
            }
            if (
                suppressedCanonicals &&
                entry.canonical &&
                suppressedCanonicals.has(entry.canonical) &&
                entry.name === entry.canonical
            ) {
                return false;
            }
            return true;
        });
    } else {
        // Fallback: re-scan the body if the parser transform didn't run or failed.
        const { referencedIndices, aliasByIndex, directReferenceIndices } =
            gatherImplicitArgumentReferences(functionNode);

        const entries: ImplicitArgumentDocEntry[] = [];
        const maxIndex = Math.max(...Array.from(referencedIndices), ...Array.from(directReferenceIndices), -1);

        const suppressedCanonicals = suppressedImplicitDocCanonicalByNode.get(functionNode);

        for (let i = 0; i <= maxIndex; i++) {
            if (referencedIndices.has(i) || directReferenceIndices.has(i)) {
                const alias = aliasByIndex.get(i);
                const canonical = `argument${i}`;
                const docName = alias || canonical;

                if (suppressedCanonicals && suppressedCanonicals.has(canonical) && docName === canonical) {
                    continue;
                }

                entries.push({
                    index: i,
                    name: docName,
                    canonical,
                    fallbackCanonical: canonical,
                    hasDirectReference: directReferenceIndices.has(i)
                });
            }
        }

        return entries;
    }
}

function processImplicitArgumentEntries(functionNode: any, entries: ImplicitArgumentDocEntry[]): void {
    try {
        const referenceInfo = gatherImplicitArgumentReferences(functionNode);
        if (!referenceInfo) {
            return;
        }

        if (referenceInfo.aliasByIndex.size > 0) {
            for (const entry of entries) {
                if (entry && entry.index !== undefined && referenceInfo.aliasByIndex.has(entry.index)) {
                    const alias = referenceInfo.aliasByIndex.get(entry.index);
                    if (alias) {
                        entry.name = alias;
                    }
                }
            }
        }

        markEntriesWithDirectReferences(entries, referenceInfo.directReferenceIndices);

        if (entries.some((entry) => entry && !entry.hasDirectReference)) {
            scanEntriesForCanonicals(entries);
        }
    } catch {
        /* ignore */
    }
}

function markEntriesWithDirectReferences(
    entries: Array<any>,
    directReferenceIndices: Set<number> | null | undefined
): void {
    if (!directReferenceIndices || directReferenceIndices.size === 0) {
        return;
    }

    for (const entry of entries) {
        if (!entry) {
            continue;
        }

        const index = entry.index;
        if (index == null) {
            continue;
        }

        if (entry.hasDirectReference) {
            continue;
        }

        if (directReferenceIndices.has(index)) {
            entry.hasDirectReference = true;
        }
    }
}

function scanEntriesForCanonicals(entries: Array<any>): void {
    const canonicalToEntries = new Map();

    for (const entry of entries) {
        if (!entry) {
            continue;
        }

        const key = entry.canonical || entry.fallbackCanonical || entry.name;
        if (!canonicalToEntries.has(key)) {
            canonicalToEntries.set(key, []);
        }
        canonicalToEntries.get(key).push(entry);
    }
}
