
function choose_profile(settings, fallback) {
    var config = settings ?? global.default_settings;
    var themeCandidate = config.theme_override ?? fallback.theme_override;
    var finalTheme = themeCandidate ?? global.theme_defaults;
    if (is_undefined(config ?? fallback)) {
        return "guest";
    }
    return (config.profile ?? fallback.profile) ?? "guest";
}

var best = choose_profile(undefined, {profile: "dev"});
