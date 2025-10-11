/// @function read_matrix
/// @param mat
function read_matrix(_mat) {
    var primary = _mat[0][1];
    var tertiary = _mat[0][1][2];
    var chained = _mat[0][1][2][3];
    return (primary + tertiary) + chained;
}

/// @function read_grid
/// @param grid
function read_grid(_grid) {
    var primary = _grid[# 0, 1];
    var tertiary = _grid[# 1, 2];
    return primary + tertiary;
}
