import * as IdentifierCase from "./src/identifier-case/index.js";
import * as ProjectIndex from "./src/project-index/index.js";
import * as Scopes from "./src/scopes/index.js";
import * as Resources from "./src/resources/index.js";
import * as SemOracle from "./src/sem-oracle.js";
import * as SCIPTypes from "./src/scip-types.js";
import * as SCIPSymbols from "./src/scip-symbols.js";

// Export a singular namespace for the package
export const Semantic = Object.freeze({
    ...IdentifierCase,
    ...ProjectIndex,
    ...Scopes,
    ...Resources,
    ...SemOracle,
    ...SCIPTypes,
    ...SCIPSymbols
});
