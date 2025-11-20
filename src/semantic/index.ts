import * as IdentifierCase from "./src/identifier-case/index.js";
import * as ProjectIndex from "./src/project-index/index.js";
import * as Scopes from "./src/scopes/index.js";
import * as Resources from "./src/resources/index.js";
import * as SemOracle from "./src/sem-oracle.js";
import * as SCIPTypes from "./src/scip-types.js";
import * as SCIPSymbols from "./src/scip-symbols.js";

// Export a singular namespace for the package. Per AGENTS.md the package
// public surface MUST expose a single flattened namespace assembled by
// spreading curated submodule public APIs. Tests and downstream callers
// expect top-level access (e.g. `Semantic.buildProjectIndex`). Preserve
// that shape here.
// Compose a base object with the modules that are safe to eagerly include.
// Some submodules import each other and can create circular evaluation
// order problems if we attempt to eagerly access their exports here. To
// preserve the flattened public API while avoiding circular-init errors we
// return a proxy that lazily resolves properties from the underlying
// namespaces on first access. The proxy is frozen to present an immutable
// exported namespace to consumers.
const eager = {
    ...Scopes,
    ...Resources,
    ...SemOracle,
    ...SCIPTypes,
    ...SCIPSymbols
};

const resolverOrder = [IdentifierCase, ProjectIndex];

const handler = {
    get(target, prop) {
        if (prop === "__isProxy") return true;
        if (prop in target) {
            return target[prop];
        }

        for (const ns of resolverOrder) {
            // access property lazily; referencing `ns[prop]` will trigger
            // evaluation of that submodule only when consumers actually
            // require the property, avoiding circular-init problems.
            if (ns && prop in ns) {
                return ns[prop];
            }
        }

        return undefined;
    },
    has(target, prop) {
        if (prop in target) return true;
        for (const ns of resolverOrder) {
            if (ns && prop in ns) return true;
        }
        return false;
    }
};

export const Semantic = Object.freeze(new Proxy(eager, handler));
