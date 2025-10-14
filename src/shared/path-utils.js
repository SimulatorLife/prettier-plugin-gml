import { isNonEmptyString } from "./string-utils.js";

export function toPosixPath(inputPath) {
    if (!isNonEmptyString(inputPath)) {
        return "";
    }

    return inputPath.replace(/\\+/g, "/");
}
