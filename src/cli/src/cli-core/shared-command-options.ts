import { Option } from "commander";

export const PROJECT_PATH_OPTION_FLAGS = "--project <path>";
export const PROJECT_PATH_OPTION_DESCRIPTION = "GameMaker project root directory or .yyp path";

export const APPLY_FIXES_OPTION_FLAGS = "--fix";
export const APPLY_FIXES_OPTION_DESCRIPTION = "Apply changes to files.";

export function createProjectPathOption(): Option {
    return new Option(PROJECT_PATH_OPTION_FLAGS, PROJECT_PATH_OPTION_DESCRIPTION);
}

export function createApplyFixesOption(): Option {
    return new Option(APPLY_FIXES_OPTION_FLAGS, APPLY_FIXES_OPTION_DESCRIPTION).default(false);
}
