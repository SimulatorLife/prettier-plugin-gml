import { configs, plugin } from "./plugin.js";
import { ruleIds } from "./rules/catalog.js";
import { services } from "./services/index.js";

export const Lint = Object.freeze({
    plugin,
    configs,
    ruleIds,
    services
});
