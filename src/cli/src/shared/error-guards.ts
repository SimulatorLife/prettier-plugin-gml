import {
    isErrorLike,
    isErrorWithCode,
    isObjectLike
} from "../dependencies.js";

export interface ErrorLikeDetails {
    name?: string;
    message?: string;
    stack?: string;
    cause?: unknown;
    code?: unknown;
    usage?: unknown;
}

export interface ErrorWithCodeDetails<TCode> extends ErrorLikeDetails {
    code: TCode;
}

export function asErrorLike(error: unknown): ErrorLikeDetails | null {
    if (!isErrorLike(error) || !isObjectLike(error)) {
        return null;
    }

    return error as ErrorLikeDetails;
}

export function asErrorWithCode<TCode>(
    error: unknown,
    code?: TCode
): ErrorWithCodeDetails<TCode> | null {
    if (!isErrorWithCode(error, code) || !isObjectLike(error)) {
        return null;
    }

    return error as ErrorWithCodeDetails<TCode>;
}
