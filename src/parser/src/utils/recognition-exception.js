export {
    isRecognitionExceptionLike,
    installRecognitionExceptionLikeGuard
} from "../runtime/recognition-exception-patch.js";

// This thin re-export preserves the legacy utils path expected by tests and
// other internal consumers. The actual implementation lives under
// runtime/recognition-exception-patch.js so runtime-specific dependencies are
// colocated there.
// TODO: Remove this file once all internal consumers have been migrated.
