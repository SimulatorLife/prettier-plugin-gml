export function toPosixPath(inputPath) {
    if (typeof inputPath !== "string" || inputPath.length === 0) {
        return "";
    }

    return inputPath.replace(/\\+/g, "/");
}
