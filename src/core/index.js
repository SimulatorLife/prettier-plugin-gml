import * as Flat from "./src/index.js";

// Expose a single Core namespace for the package
export const Core = Object.freeze({ ...Flat });
