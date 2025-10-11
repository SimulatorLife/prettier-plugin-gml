function read_matrix(_grid)
{
    var primary = _grid[0, 1];
    var tertiary = _grid[0, 1, 2];
    var chained = _grid[0, 1, 2, 3];
    return primary + tertiary + chained;
}
