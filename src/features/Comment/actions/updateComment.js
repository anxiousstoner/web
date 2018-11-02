import update from 'immutability-helper';

/*--------- CONSTANTS ---------*/
const UPDATE_COMMENT = 'UPDATE_COMMENT';

/*--------- ACTIONS ---------*/
export function updateComment(commentKey, field, value) {
  return { type: UPDATE_COMMENT, commentKey, field, value };
}

/*--------- REDUCER ---------*/
export function updateCommentReducer(state, action) {
  switch (action.type) {
    case UPDATE_COMMENT: {
      return update(state, {
        commentsData: {
          [action.commentKey]: { $merge: { [action.field]: action.value } },
        }
      });
    }
    default:
      return state;
  }
}
