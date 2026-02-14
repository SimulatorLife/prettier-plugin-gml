import { featherRuleMap, gmlRuleMap } from "./catalog.js";

export const lintRules = Object.freeze({
    ...gmlRuleMap,
    ...featherRuleMap
});
