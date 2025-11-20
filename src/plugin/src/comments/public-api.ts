// Narrow public surface exposing comment helpers relied upon by the
// plugin wiring. Keeping this facade lean avoids pulling in the entire
// comment module tree (and its side effects) when high-level dependency
// bundles only need the printer adapters.
export { handleComments, printComment } from "./comment-printer.js";
