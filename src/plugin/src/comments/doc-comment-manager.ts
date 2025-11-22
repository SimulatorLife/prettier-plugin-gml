import { Parser } from "@gml-modules/parser";

// Delegate plugin-side comment management to the parser's canonical
// implementation. This removes duplicated source while keeping the plugin
// facade stable for consumers. The parser package exports a `Comments`
// namespace from its package root; re-export the necessary facade names here
// so existing plugin consumers do not need to change imports.
// TODO: Consider moving this to @gml-modules/core if other packages need it.

export const prepareDocCommentEnvironment =
    Parser.Comments.prepareDocCommentEnvironment;

export const resolveDocCommentTraversalService =
    Parser.Comments.resolveDocCommentTraversalService;

export const resolveDocCommentCollectionService =
    Parser.Comments.resolveDocCommentCollectionService;

export const resolveDocCommentPresenceService =
    Parser.Comments.resolveDocCommentPresenceService;

export const resolveDocCommentDescriptionService =
    Parser.Comments.resolveDocCommentDescriptionService;

export const resolveDocCommentUpdateService =
    Parser.Comments.resolveDocCommentUpdateService;
