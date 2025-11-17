import * as Flat from "./src/index.js";

// Expose a single Core namespace for the package
export const Core = Object.freeze({ ...Flat });

// Re-export the named flat exports so consumers can import helpers directly
// from the package root (e.g. `import { isNonEmptyString } from "@gml-modules/core"`).
// This preserves the historical public surface while still providing the
// single `Core` namespace object.
export * from "./src/index.js";
