fnames = [];

var _fname = file_find_first("*.txt", fa_none);

while (_fname != "")
{
    array_push(fnames, _fname);

    _fname = file_find_next();
}

file_find_close();

file_find_next();
