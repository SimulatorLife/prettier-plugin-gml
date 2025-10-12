/// @function AttackController
/// @param [attack_bonus=10]
function AttackController (attack_bonus = 10) constructor {

    self.attack_bonus = attack_bonus;

    /// @function perform_attack
    /// @returns {undefined}
    static perform_attack = function() {
        var base_atk = 1;  // Local variable for base attack value. Can be passed into 'with' block as-is.

        // Inside a with block, 'other' will be the instance or struct that called the with() function
        with (other) {  // Target the calling instance
            var total_atk = (base_atk + other.attack_bonus);
            hp.subtract(total_atk);  // Assumes 'hp' is a variable in the target/calling instance
        }
    }

}

value = 40;

var _struct = instance_create_depth(0, 0, 0, Object2, {
    value : 99,
    func : function () {
        return self.value;
    }
});

var _func = _struct.func;

show_message(_func());  // Prints 99

value = 40;

/// @function item
item = function () constructor {
    value = 99;
    copied_value = self.value;
}

my_item = new item();
show_debug_message(my_item.copied_value);  // Prints 99
