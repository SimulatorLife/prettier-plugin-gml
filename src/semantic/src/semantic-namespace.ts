// TODO: Combine/handle this in 'index.ts'
import * as IdentifierCase from "./identifier-case/index.js";
import * as ProjectIndex from "./project-index/index.js";
import * as Scopes from "./scopes/index.js";
import * as Resources from "./resources/index.js";
import * as SemOracle from "./sem-oracle.js";
import * as SCIPTypes from "./scip-types.js";
import * as SCIPSymbols from "./scip-symbols.js";

const eager = {
    ...Scopes,
    ...Resources,
    ...SemOracle,
    ...SCIPTypes,
    ...SCIPSymbols
};

const resolverOrder = [IdentifierCase, ProjectIndex];

const handler: ProxyHandler<typeof eager> = {
    get(target, prop) {
        if (prop === "__isProxy") return true;
        if (prop in target) {
            return target[prop];
        }

        for (const ns of resolverOrder) {
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
