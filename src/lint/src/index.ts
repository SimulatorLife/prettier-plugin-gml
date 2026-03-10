import * as DocComment from "./doc-comment/index.js";
import * as Malformed from "./malformed/index.js";
import { configs, featherPlugin, plugin } from "./plugin.js";
import { ruleIds } from "./rules/catalog.js";
import { services } from "./services/index.js";

export const Lint = Object.freeze({
    plugin,
    featherPlugin,
    configs,
    ruleIds,
    services,
    Malformed,
    ...DocComment
});
