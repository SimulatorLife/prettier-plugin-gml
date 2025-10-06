// Feather disable all
/// .__Destroy()
/// 
/// .__FromBuffer(buffer)
/// 
/// .__CopyFromBuffer(buffer)
/// 
/// .__FromString(string, ...)
/// 
/// .__Delete(position, count)
/// 
/// .__Insert(position, string, ...)
/// 
/// .__Overwrite(position, string, ...)
/// 
/// .__Prefix(string, ...)
/// 
/// .__Suffix(string, ...)
/// 
/// .__GetString()
/// 
/// .__GetBuffer()

/// @function __ChatterboxBufferBatch
function __ChatterboxBufferBatch() constructor {
    __destroyed  = false;
    __inBuffer   = undefined;
    __workBuffer = undefined;
    __outBuffer  = undefined;
    __commands   = [];

    /// @function __Destroy
    static __Destroy = function() {
        if (__destroyed) { return; }
        __destroyed = true;

        if (!is_undefined(__inBuffer)) {
            buffer_delete(__inBuffer);
            __inBuffer = undefined;
        }
    }
}