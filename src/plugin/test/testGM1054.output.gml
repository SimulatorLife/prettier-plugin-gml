/// @function Base
function Base() constructor {
    self.value = 1;
}

/// @function Child
function Child() : Base() constructor {
    constructor_apply();
}

/// @function Orphan
function Orphan() constructor {}
