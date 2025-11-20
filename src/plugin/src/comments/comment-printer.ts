import * as Parser from "@gml-modules/parser";

// Delegate comment printing helpers to the parser package's canonical
// implementation. The plugin facade re-exports these symbols, so keep the
// exported names identical to avoid changing consumer imports.

export const handleComments = Parser.Comments.handleComments;
export const printComment = Parser.Comments.printComment;
export const printDanglingComments = Parser.Comments.printDanglingComments;
export const printDanglingCommentsAsGroup =
    Parser.Comments.printDanglingCommentsAsGroup;
