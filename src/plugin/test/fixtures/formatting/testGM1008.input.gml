function demo() {
    working_directory = @"PlayerData";
    var first = file_find_first(working_directory + @"/Screenshots/*.png", fa_archive);
    var second = working_directory + "/Manual";
    return working_directory;
}
