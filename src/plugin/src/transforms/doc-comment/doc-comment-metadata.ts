import { Core } from "@gml-modules/core";

export type DocCommentMetadata = {
    documentedParamNames?: Set<string>;
    hasDeprecatedDocComment?: boolean;
};

const DOC_COMMENT_METADATA_KEY = Symbol("gmlDocCommentMetadata");
const DOC_COMMENT_DEPRECATED_SET_KEY = Symbol("gmlDocCommentDeprecatedFunctionNames");

export function getDocCommentMetadata(node: unknown): DocCommentMetadata | null {
    if (Core.shouldSkipTraversal(node)) {
        return null;
    }

    const payload = Reflect.get(node as object, DOC_COMMENT_METADATA_KEY);

    if (!payload || typeof payload !== "object") {
        return null;
    }

    const { documentedParamNames, hasDeprecatedDocComment } = payload as {
        documentedParamNames?: Set<string>;
        hasDeprecatedDocComment?: boolean;
    };

    const metadata: DocCommentMetadata = {};

    if (Core.isSetLike(documentedParamNames) && documentedParamNames.size > 0) {
        metadata.documentedParamNames = documentedParamNames;
    }

    if (hasDeprecatedDocComment) {
        metadata.hasDeprecatedDocComment = true;
    }

    return Object.keys(metadata).length === 0 ? null : metadata;
}

export function setDocCommentMetadata(node: unknown, payload: DocCommentMetadata | null) {
    if (Core.shouldSkipTraversal(node)) {
        return;
    }

    if (!payload) {
        Reflect.deleteProperty(node as object, DOC_COMMENT_METADATA_KEY);
        return;
    }

    Reflect.set(node as object, DOC_COMMENT_METADATA_KEY, payload);
}

export function setDeprecatedDocCommentFunctionSet(ast: unknown, functions: Set<string> | null) {
    if (!ast || typeof ast !== "object") {
        return;
    }

    if (functions === null || functions.size === 0) {
        Reflect.deleteProperty(ast, DOC_COMMENT_DEPRECATED_SET_KEY);
        return;
    }

    Reflect.set(ast, DOC_COMMENT_DEPRECATED_SET_KEY, functions);
}

export function getDeprecatedDocCommentFunctionSet(ast: unknown): Set<string> | null {
    if (!ast || typeof ast !== "object") {
        return null;
    }

    const functions = Reflect.get(ast, DOC_COMMENT_DEPRECATED_SET_KEY);

    if (Core.isSetLike(functions)) {
        return functions;
    }

    return null;
}
