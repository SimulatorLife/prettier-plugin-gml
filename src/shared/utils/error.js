export function getErrorCode(error) {
    if (!error || typeof error !== "object") {
        return null;
    }

    const { code } = error;
    if (typeof code !== "string" || code.length === 0) {
        return null;
    }

    return code;
}

export function isErrorWithCode(error, ...codes) {
    if (codes.length === 0) {
        return false;
    }

    const code = getErrorCode(error);
    if (code === null) {
        return false;
    }

    return codes.includes(code);
}

export function getErrorMessage(error, { fallback } = {}) {
    if (typeof error?.message === "string") {
        return error.message;
    }

    if (typeof error === "string") {
        return error;
    }

    if (typeof fallback === "function") {
        return fallback(error);
    }

    if (fallback !== undefined) {
        return fallback;
    }

    if (error == null) {
        return "";
    }

    try {
        return String(error);
    } catch {
        return "";
    }
}
