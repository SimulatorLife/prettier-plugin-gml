#region
#endregion

// This is a comment, not a region
// #region Not a region
// endregion
// #endregion

#region A region


#macro VALID_MACRO 1

var sentinel = true;
#endregion End regions can also have comments


#region Embedded region

	#region Inner region
  global.inner = 1;
	#endregion

#endregion
