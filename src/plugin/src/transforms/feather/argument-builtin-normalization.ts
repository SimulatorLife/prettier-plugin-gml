/**
 * Argument builtin normalization transforms.
 *
 * This module handles the normalization of GML's legacy `argument[N]` and `argumentN` built-in
 * references to named function parameters. It processes argument index mapping, aliasing,
 * doc comment integration, and promotion of implicit arguments to explicit parameters.
 */

import { Core } from "@gml-modules/core";

import { getDocCommentMetadata } from "../doc-comment/doc-comment-metadata.js";
import { applyOrderedDocNamesToImplicitEntries, resolveFunctionTagParamList } from "./doc-comment-fixes.js";
import { attachFeatherFixMetadata, createFeatherFixDetail, hasFeatherDiagnosticContext } from "./utils.js";

type ArgumentReference = { node: any; index: number };

type ArgumentAliasDeclaration = {
    index: number;
    name: string;
    init: any;
    declarator: any;
};

function cleanupSelfAssignments(node) {
    const renames = new Map();

    const traverse = (n) => {
        if (!n || typeof n !== "object") {
            return;
        }

        if (Array.isArray(n)) {
            for (let i = n.length - 1; i >= 0; i--) {
                traverse(n[i]);
                const child = n[i];
                if (child && child.type === "VariableDeclaration" && child.declarations.length === 0) {
                    n.splice(i, 1);
                }
            }
            return;
        }

        if (n.type === "VariableDeclaration") {
            n.declarations = n.declarations.filter((declarator) => {
                if (declarator.type !== "VariableDeclarator") {
                    return true;
                }
                if (declarator.id.type !== "Identifier") {
                    return true;
                }
                if (!declarator.init || declarator.init.type !== "Identifier") {
                    return true;
                }
                if (declarator.id.name === declarator.init.name) {
                    return false;
                }
                if (declarator.id.name === `_${declarator.init.name}`) {
                    renames.set(declarator.id.name, declarator.init.name);
                    return false;
                }
                return true;
            });
            return;
        }

        for (const key of Object.keys(n)) {
            if (
                key === "parent" ||
                key === "loc" ||
                key === "start" ||
                key === "end" ||
                key === "range" ||
                key === "comments"
            ) {
                continue;
            }
            traverse(n[key]);
        }
    };

    traverse(node);

    if (renames.size > 0) {
        const applyRenames = (n) => {
            if (!n || typeof n !== "object") {
                return;
            }

            if (Array.isArray(n)) {
                for (const child of n) {
                    applyRenames(child);
                }
                return;
            }

            if (n.type === "Identifier" && renames.has(n.name)) {
                n.name = renames.get(n.name);
            }

            for (const key of Object.keys(n)) {
                if (
                    key === "parent" ||
                    key === "loc" ||
                    key === "start" ||
                    key === "end" ||
                    key === "range" ||
                    key === "comments"
                ) {
                    continue;
                }
                applyRenames(n[key]);
            }
        };

        applyRenames(node);
    }
}

export function normalizeArgumentBuiltinReferences({ ast, diagnostic, collectionService, sourceText }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                visit(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isFunctionLikeNode(node)) {
            const metadata = getDocCommentMetadata(node);
            const documentedParamNames = metadata?.documentedParamNames ?? new Set<string>();
            const functionFixes = fixArgumentReferencesWithinFunction(
                node,
                diagnostic,
                collectionService,
                documentedParamNames,
                sourceText
            );

            if (Core.isNonEmptyArray(functionFixes)) {
                fixes.push(...functionFixes);
            }

            return;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

export function updateImplicitArgumentDocEntryIndices(functionNode, mapping) {
    const entries = functionNode?._featherImplicitArgumentDocEntries;
    if (!entries) {
        return;
    }

    for (const entry of entries) {
        if (!entry || typeof entry.index !== "number") {
            continue;
        }

        if (!mapping.has(entry.index)) {
            continue;
        }

        const oldIndex = entry.index;
        const newIndex = mapping.get(oldIndex);
        entry.index = newIndex;

        if (entry.name === `argument${oldIndex}`) {
            entry.name = `argument${newIndex}`;
        }
        if (entry.canonical === `argument${oldIndex}`) {
            entry.canonical = `argument${newIndex}`;
        }
        if (entry.fallbackCanonical === `argument${oldIndex}`) {
            entry.fallbackCanonical = `argument${newIndex}`;
        }
    }
}

function fixArgumentReferencesWithinFunction(
    functionNode,
    diagnostic,
    collectionService,
    documentedParamNames,
    sourceText
) {
    const resolvedDocNames = populateDocumentedParamNames({
        functionNode,
        collectionService,
        documentedParamNames,
        sourceText
    });

    const referenceState = collectArgumentReferenceState({
        functionNode,
        diagnostic,
        collectionService,
        documentedParamNames,
        sourceText
    });

    if (referenceState.references.length === 0) {
        return referenceState.fixes;
    }

    const mapping = createArgumentIndexMapping(referenceState.references.map((reference) => reference.index));

    if (!Core.isMapLike(mapping) || !Core.hasIterableItems(mapping)) {
        return referenceState.fixes;
    }

    if (functionNode._featherImplicitArgumentDocEntries) {
        updateImplicitArgumentDocEntryIndices(functionNode, mapping);
        applyOrderedDocNamesToImplicitEntries(functionNode, resolvedDocNames, collectionService, sourceText);
    }

    applyArgumentIndexMappingFixes({
        references: referenceState.references,
        mapping,
        diagnostic,
        fixes: referenceState.fixes
    });

    applyArgumentAliasAndDocFixes({
        functionNode,
        resolvedDocNames,
        mapping,
        references: referenceState.references,
        aliasDeclarations: referenceState.aliasDeclarations,
        documentedParamNames,
        diagnostic,
        fixes: referenceState.fixes
    });

    const promotionPlan = buildImplicitArgumentPromotionPlan({
        references: referenceState.references,
        mapping,
        orderedDocNames: resolvedDocNames,
        aliasDeclarations: referenceState.aliasDeclarations,
        documentedParamNames
    });

    if (promotionPlan) {
        applyImplicitArgumentPromotions({
            references: referenceState.references,
            mapping,
            promotionPlan,
            diagnostic,
            fixes: referenceState.fixes
        });
        maybeInsertImplicitFunctionParameters({
            functionNode,
            promotionPlan
        });
    }

    cleanupSelfAssignments(functionNode.body);

    return referenceState.fixes;
}

function populateDocumentedParamNames({
    functionNode,
    collectionService,
    documentedParamNames,
    sourceText
}: {
    functionNode: any;
    collectionService: any;
    documentedParamNames: Set<string>;
    sourceText: string | null;
}) {
    const orderedDocNames = functionNode._documentedParamNamesOrdered as string[] | undefined;
    const functionTagParams = resolveFunctionTagParamList(functionNode, collectionService, sourceText);
    const resolvedDocNames = functionTagParams ?? orderedDocNames;

    if (resolvedDocNames && resolvedDocNames.length > 0) {
        for (const name of resolvedDocNames) {
            documentedParamNames.add(name);
        }
    }

    return resolvedDocNames;
}

function collectArgumentReferenceState({
    functionNode,
    diagnostic,
    collectionService,
    documentedParamNames,
    sourceText
}: {
    functionNode: any;
    diagnostic: any;
    collectionService: any;
    documentedParamNames: Set<string>;
    sourceText: string | null;
}) {
    const fixes: any[] = [];
    const references: ArgumentReference[] = [];
    const aliasDeclarations: ArgumentAliasDeclaration[] = [];

    const traverse = (node: any) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                traverse(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isVariableDeclaratorNode(node)) {
            const aliasIndex = getArgumentIdentifierIndex(node.init);

            if (
                typeof aliasIndex === "number" &&
                node.id?.type === "Identifier" &&
                typeof node.id.name === "string" &&
                node.id.name.length > 0
            ) {
                aliasDeclarations.push({
                    index: aliasIndex,
                    name: node.id.name,
                    init: node.init,
                    declarator: node
                });
            }
        }

        if (node !== functionNode && Core.isFunctionLikeNode(node)) {
            const nestedFixes = fixArgumentReferencesWithinFunction(
                node,
                diagnostic,
                collectionService,
                documentedParamNames,
                sourceText
            );

            if (Core.isNonEmptyArray(nestedFixes)) {
                fixes.push(...nestedFixes);
            }

            return;
        }

        const argumentIndex = getArgumentIdentifierIndex(node);

        if (typeof argumentIndex === "number") {
            references.push({ node, index: argumentIndex });
            return;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                traverse(value);
            }
        }
    };

    const body = functionNode?.body;
    if (body && typeof body === "object") {
        traverse(body);
    } else {
        traverse(functionNode);
    }

    return { fixes, references, aliasDeclarations };
}

function applyArgumentIndexMappingFixes({
    references,
    mapping,
    diagnostic,
    fixes
}: {
    references: ArgumentReference[];
    mapping: Map<any, any>;
    diagnostic: any;
    fixes: any[];
}) {
    for (const reference of references) {
        const newIndex = mapping.get(reference.index);

        if (typeof newIndex !== "number" || newIndex === reference.index) {
            continue;
        }

        const newName = `argument${newIndex}`;
        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: newName,
            range: {
                start: Core.getNodeStartIndex(reference.node),
                end: Core.getNodeEndIndex(reference.node)
            }
        });

        if (!fixDetail) {
            continue;
        }

        reference.node.name = newName;
        attachFeatherFixMetadata(reference.node, [fixDetail]);
        fixes.push(fixDetail);
    }
}

function applyArgumentAliasAndDocFixes({
    functionNode,
    resolvedDocNames,
    mapping,
    references,
    aliasDeclarations,
    documentedParamNames,
    diagnostic,
    fixes
}: {
    functionNode: any;
    resolvedDocNames: string[] | undefined;
    mapping: Map<any, any>;
    references: ArgumentReference[];
    aliasDeclarations: ArgumentAliasDeclaration[];
    documentedParamNames: Set<string>;
    diagnostic: any;
    fixes: any[];
}) {
    if (documentedParamNames.size === 0) {
        return;
    }

    const normalizedDocNames = new Set([...documentedParamNames].map(Core.normalizeDocParamNameForComparison));

    const aliasInfos = aliasDeclarations
        .map((alias) => {
            const mappedIndex = mapping.get(alias.index);
            const normalizedAliasName = typeof alias.name === "string" ? alias.name : null;

            return {
                index: typeof mappedIndex === "number" ? mappedIndex : alias.index,
                name: normalizedAliasName,
                init: alias.init,
                declarator: alias.declarator
            };
        })
        .filter(
            (alias) =>
                typeof alias.index === "number" &&
                typeof alias.name === "string" &&
                alias.name.length > 0 &&
                normalizedDocNames.has(Core.normalizeDocParamNameForComparison(alias.name))
        );

    if (aliasInfos.length === 0 && (!resolvedDocNames || resolvedDocNames.length === 0)) {
        return;
    }

    const aliasByIndex = new Map();
    const aliasInitNodes = new Set();

    for (const alias of aliasInfos) {
        aliasByIndex.set(alias.index, alias);
        if (alias.init) {
            aliasInitNodes.add(alias.init);
        }
    }

    for (const reference of references) {
        const normalizedIndex = mapping.has(reference.index) ? mapping.get(reference.index) : reference.index;
        const alias = aliasByIndex.get(normalizedIndex);

        let newName = null;
        let sourceNode = null;

        if (resolvedDocNames && normalizedIndex < resolvedDocNames.length) {
            newName = resolvedDocNames[normalizedIndex];
        } else if (alias && !aliasInitNodes.has(reference.node)) {
            newName = alias.name;
            sourceNode = alias.declarator;
        }

        if (!newName) {
            continue;
        }

        if (reference.node?.type !== "Identifier") {
            continue;
        }

        if (reference.node.name === newName) {
            continue;
        }

        if (sourceNode) {
            const aliasStart = Core.getNodeStartIndex(sourceNode);
            const referenceStart = Core.getNodeStartIndex(reference.node);

            if (typeof aliasStart === "number" && typeof referenceStart === "number" && referenceStart < aliasStart) {
                continue;
            }
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: newName,
            range: {
                start: Core.getNodeStartIndex(reference.node),
                end: Core.getNodeEndIndex(reference.node)
            }
        });

        if (fixDetail) {
            attachFeatherFixMetadata(reference.node, [fixDetail]);
            fixes.push(fixDetail);
        }

        reference.node.name = newName;
    }

    if (!functionNode._featherImplicitArgumentDocEntries) {
        return;
    }

    const remainingDirectRefIndices = new Set();

    for (const reference of references) {
        if (aliasInitNodes.has(reference.node)) {
            continue;
        }

        if (/^argument\d+$/.test(reference.node.name)) {
            const normalizedIndex = mapping.has(reference.index) ? mapping.get(reference.index) : reference.index;
            remainingDirectRefIndices.add(normalizedIndex);
        }
    }

    for (const entry of functionNode._featherImplicitArgumentDocEntries) {
        if (entry && typeof entry.index === "number" && !remainingDirectRefIndices.has(entry.index)) {
            entry.hasDirectReference = false;
        }
    }
}

function applyImplicitArgumentPromotions({
    references,
    mapping,
    promotionPlan,
    diagnostic,
    fixes
}: {
    references: ArgumentReference[];
    mapping: Map<any, any>;
    promotionPlan: any;
    diagnostic: any;
    fixes: any[];
}) {
    const { names } = promotionPlan;

    for (const reference of references) {
        const normalizedIndex = mapping.has(reference.index) ? mapping.get(reference.index) : reference.index;
        if (typeof normalizedIndex !== "number" || normalizedIndex < 0 || normalizedIndex >= names.length) {
            continue;
        }

        const newName = names[normalizedIndex];
        if (!newName) {
            continue;
        }

        const referenceNode = reference.node;
        if (!referenceNode || typeof referenceNode !== "object") {
            continue;
        }

        if (referenceNode.type === "Identifier") {
            if (referenceNode.name === newName) {
                continue;
            }
            referenceNode.name = newName;
        } else if (
            referenceNode.type === "MemberIndexExpression" &&
            Core.isIdentifierWithName(referenceNode.object, "argument")
        ) {
            referenceNode.type = "Identifier";
            referenceNode.name = newName;
            delete referenceNode.object;
            delete referenceNode.property;
            delete referenceNode.accessor;
        } else {
            continue;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: newName,
            range: {
                start: Core.getNodeStartIndex(referenceNode),
                end: Core.getNodeEndIndex(referenceNode)
            }
        });

        if (fixDetail) {
            attachFeatherFixMetadata(referenceNode, [fixDetail]);
            fixes.push(fixDetail);
        }
    }
}

function maybeInsertImplicitFunctionParameters({ functionNode, promotionPlan }) {
    if (!functionNode || !promotionPlan) {
        return;
    }

    const existingParams = Core.asArray(functionNode.params);
    if (existingParams.length > 0) {
        return;
    }

    const { names, aliasByIndex } = promotionPlan;
    if (!Array.isArray(names) || names.length === 0) {
        return;
    }

    const nextParams = [];
    for (const [index, name] of names.entries()) {
        if (!name) {
            return;
        }

        const alias = aliasByIndex.get(index);
        const templateNode = alias?.declarator?.id ?? alias?.declarator ?? functionNode ?? null;
        const identifier = Core.createIdentifierNode(name, templateNode);
        if (!identifier) {
            return;
        }

        nextParams.push(identifier);
    }

    functionNode.params = nextParams;
}

function buildImplicitArgumentPromotionPlan({
    references,
    mapping,
    orderedDocNames,
    aliasDeclarations,
    documentedParamNames
}) {
    if (!Array.isArray(references) || references.length === 0) {
        return null;
    }

    if (!Core.isMapLike(mapping) || !Core.hasIterableItems(mapping)) {
        return null;
    }

    const normalizedIndices = [];
    for (const reference of references) {
        if (!reference || typeof reference.index !== "number") {
            continue;
        }

        const normalizedIndex = mapping.has(reference.index) ? mapping.get(reference.index) : reference.index;

        if (typeof normalizedIndex === "number" && normalizedIndex >= 0) {
            normalizedIndices.push(normalizedIndex);
        }
    }

    if (normalizedIndices.length === 0) {
        return null;
    }

    const maxIndex = Math.max(...normalizedIndices);
    if (!Number.isInteger(maxIndex) || maxIndex < 0) {
        return null;
    }

    const aliasByIndex = new Map();
    for (const alias of aliasDeclarations ?? []) {
        if (!alias || typeof alias.index !== "number") {
            continue;
        }

        const normalizedIndex = mapping.has(alias.index) ? mapping.get(alias.index) : alias.index;

        if (
            typeof normalizedIndex !== "number" ||
            normalizedIndex < 0 ||
            typeof alias.name !== "string" ||
            alias.name.length === 0
        ) {
            continue;
        }

        aliasByIndex.set(normalizedIndex, alias);
    }

    const hasDocumentedNames = documentedParamNames && documentedParamNames.size > 0;
    const names = [];

    for (let index = 0; index <= maxIndex; index += 1) {
        const docName =
            hasDocumentedNames && Array.isArray(orderedDocNames) && index < orderedDocNames.length
                ? orderedDocNames[index]
                : null;
        const alias = aliasByIndex.get(index);

        const preferredDocName = normalizeImplicitParamName(docName);
        const preferredAliasName = normalizeImplicitParamName(alias?.name);
        const chosenName = preferredDocName ?? preferredAliasName;

        if (!chosenName) {
            return null;
        }

        names.push(chosenName);
    }

    return { names, aliasByIndex };
}

function normalizeImplicitParamName(name: unknown): string | null {
    const normalized = Core.getNonEmptyTrimmedString(name);
    if (!normalized) {
        return null;
    }

    if (/^argument\d+$/i.test(normalized)) {
        return null;
    }

    return normalized;
}

function createArgumentIndexMapping(indices: unknown[]) {
    if (!Core.isNonEmptyArray(indices)) {
        return null;
    }

    const uniqueIndices = (
        [
            ...new Set(
                indices.filter(
                    (index): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0
                )
            )
        ] as number[]
    ).toSorted((left, right) => left - right);

    if (uniqueIndices.length === 0) {
        return null;
    }

    const mapping = new Map();
    let expectedIndex = 0;

    for (const index of uniqueIndices) {
        if (!Number.isInteger(index) || index < 0) {
            continue;
        }

        if (index === expectedIndex) {
            mapping.set(index, index);
            expectedIndex = index + 1;
            continue;
        }

        if (index > expectedIndex) {
            mapping.set(index, expectedIndex);
            expectedIndex += 1;
            continue;
        }

        mapping.set(index, expectedIndex);
        expectedIndex += 1;
    }

    return mapping;
}

function getArgumentIdentifierIndex(node) {
    if (node?.type === "MemberIndexExpression" && Core.isIdentifierWithName(node.object, "argument")) {
        const propertyEntry = Core.getSingleMemberIndexPropertyEntry(node);
        if (!propertyEntry) {
            return null;
        }

        const indexText = Core.getMemberIndexText(propertyEntry);
        if (indexText === null) {
            return null;
        }

        const parsed = Number.parseInt(String(indexText), 10);
        return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }

    const identifierDetails = Core.getIdentifierDetails(node);
    if (!identifierDetails) {
        return null;
    }

    const match = Core.GML_ARGUMENT_IDENTIFIER_PATTERN.exec(identifierDetails.name);

    if (!match) {
        return null;
    }

    const parsed = Number.parseInt(match[1]);

    if (!Number.isInteger(parsed) || parsed < 0) {
        return null;
    }

    return parsed;
}
