export type DocCommentMetadata = {
    documentedParamNames?: Set<string>;
    hasDeprecatedDocComment?: boolean;
};

const DOC_COMMENT_METADATA_KEY = Symbol("gmlDocCommentMetadata");
const DOC_COMMENT_DEPRECATED_SET_KEY = Symbol("gmlDocCommentDeprecatedFunctionNames");

export function getDocCommentMetadata(node: unknown): DocCommentMetadata | null {
    if (!node || typeof node !== "object") {
        return null;
    }

    const payload = Reflect.get(node, DOC_COMMENT_METADATA_KEY);

    if (!payload || typeof payload !== "object") {
        return null;
    }

    const { documentedParamNames, hasDeprecatedDocComment } = payload as {
        documentedParamNames?: Set<string>;
        hasDeprecatedDocComment?: boolean;
    };

    const metadata: DocCommentMetadata = {};

    if (documentedParamNames instanceof Set && documentedParamNames.size > 0) {
        metadata.documentedParamNames = documentedParamNames;
    }

    if (hasDeprecatedDocComment) {
        metadata.hasDeprecatedDocComment = true;
    }

    return Object.keys(metadata).length === 0 ? null : metadata;
}

export function setDocCommentMetadata(node: unknown, payload: DocCommentMetadata | null) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (!payload) {
        Reflect.deleteProperty(node, DOC_COMMENT_METADATA_KEY);
        return;
    }

    Reflect.set(node, DOC_COMMENT_METADATA_KEY, payload);
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

    if (functions instanceof Set) {
        return functions;
    }

    return null;
}
