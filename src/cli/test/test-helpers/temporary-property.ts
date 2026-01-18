export function withTemporaryProperty<
    Target extends object,
    Key extends keyof Target,
    Value extends Target[Key],
    Result
>(target: Target, key: Key, replacement: Value, action: () => Result | Promise<Result>): Promise<Result> {
    const targetObject = target;
    const originalValue = targetObject[key];
    targetObject[key] = replacement;

    let actionResult: Result | Promise<Result>;

    try {
        actionResult = action();
    } catch (error) {
        targetObject[key] = originalValue;
        throw error;
    }

    return Promise.resolve(actionResult).then(
        (resolved) => {
            targetObject[key] = originalValue;
            return resolved;
        },
        (error) => {
            targetObject[key] = originalValue;
            throw error;
        }
    );
}
