import { Parser } from "@gml-modules/parser";

// Delegate comment printing helpers to the parser package's canonical
// implementation. The plugin facade re-exports these symbols, so keep the
// exported names identical to avoid changing consumer imports.

export const handleComments = Parser.handleComments;
export const printComment = Parser.printComment;
export const printDanglingComments = Parser.printDanglingComments;
export const printDanglingCommentsAsGroup = Parser.printDanglingCommentsAsGroup;
