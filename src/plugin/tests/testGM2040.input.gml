/// Room Start Event

if (should_run)
{
    event_inherited();
    show_debug_message("branch");
}

event_inherited();

show_debug_message("Ready");
