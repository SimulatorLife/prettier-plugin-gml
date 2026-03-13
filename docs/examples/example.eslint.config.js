import { Lint } from "@gmloop/lint";

export default [
    ...Lint.configs.recommended,
    ...Lint.configs.feather,
    ...Lint.configs.performance
];
