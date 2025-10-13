#define  LEGACY_MACRO 123456789
#define region Utility Scripts
var util = function(val) {
	return val * LEGACY_MACRO;
}
#define    end region Utility Scripts
#define 123 not valid

#region A region
#macro VALID_MACRO 1
var sentinel = true;
#endregion End regions cannot have names