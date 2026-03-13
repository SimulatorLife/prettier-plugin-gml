export { Semantic } from "./src/index.js";

// Export oracle types at the workspace root so consumers can import them as
// standalone types without going through the `Semantic` const namespace (which
// cannot be referenced in type position).
export type { CallTargetAnalyzer, IdentifierAnalyzer, IdentifierMetadata, SemKind } from "./src/symbols/sem-oracle.js";
