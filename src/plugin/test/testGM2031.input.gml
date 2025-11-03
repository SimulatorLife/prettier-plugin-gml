var _look_for_description = true;

var _file = file_find_first("/game_data/*.bin", fa_none);

if (_look_for_description)
{
    _file2 = file_find_first("/game_data/*.json", fa_none);
}

file_find_close();
