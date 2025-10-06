function choose_profile(settings, fallback = undefined){
var config=settings??global.default_settings
var themeCandidate=config.theme_override??fallback.theme_override;
var finalTheme=themeCandidate??global.theme_defaults
if((config??fallback)==undefined){ return "guest" }
return (config.profile??fallback.profile)??"guest"
}
var best = choose_profile(undefined , {   profile:"dev"});
