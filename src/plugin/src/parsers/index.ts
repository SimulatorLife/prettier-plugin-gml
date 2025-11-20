// Public facade for parser adapters used by the Prettier plugin.
//
// Keeping the exports centralized here allows external consumers (including
// sibling workspaces) to rely on a stable module path instead of importing
// files from the internal directory layout.
export { gmlParserAdapter } from "./gml-parser-adapter.js";
