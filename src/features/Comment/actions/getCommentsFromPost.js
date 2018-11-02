import { put, select, takeEvery } from 'redux-saga/effects';
import steem from 'steem';
import update from 'immutability-helper';
import { notification } from 'antd';
import { getRootCommentsList, mapCommentsBasedOnId } from '../utils/comments';
import { sortCommentsFromSteem } from 'utils/helpers/stateHelpers';
import { selectPosts } from 'features/Post/selectors';
import { hasUpdated } from 'features/Post/utils';
import { postRefreshBegin, postRefreshSuccess } from 'features/Post/actions/refreshPost';
import { calculateContentPayout } from 'utils/helpers/steemitHelpers';
import api from 'utils/api';

/*--------- CONSTANTS ---------*/
const GET_COMMENTS_FROM_POST_BEGIN = 'GET_COMMENTS_FROM_POST_BEGIN';
export const GET_COMMENTS_FROM_POST_SUCCESS = 'GET_COMMENTS_FROM_POST_SUCCESS';
const GET_COMMENTS_FROM_POST_FAILURE = 'GET_COMMENTS_FROM_POST_FAILURE';

/*--------- ACTIONS ---------*/
export function getCommentsFromPostBegin(category, author, permlink) {
  return { type: GET_COMMENTS_FROM_POST_BEGIN, category, author, permlink };
}

export function getCommentsFromPostSuccess(postKey, state) {
  return { type: GET_COMMENTS_FROM_POST_SUCCESS, postKey, state };
}

export function getCommentsFromPostFailure(message) {
  return { type: GET_COMMENTS_FROM_POST_FAILURE, message };
}

/*--------- REDUCER ---------*/
export function getCommentsFromPostReducer(state, action) {
  switch (action.type) {
    case GET_COMMENTS_FROM_POST_BEGIN: {
      return update(state, {
        isLoading: { $set: true },
      });
    }
    case GET_COMMENTS_FROM_POST_SUCCESS: {
      return update(state, {
        isLoading: { $set: false },
        commentsFromPost: {
          [action.postKey]: {$auto: {
            // SORTS COMMENTS HERE TO AVOID JUMPS WHEN VOTING
            list: { $set: sortCommentsFromSteem(getRootCommentsList(action.state), mapCommentsBasedOnId(action.state.content), 'score') },
          }},
        }
      });
    }
    case GET_COMMENTS_FROM_POST_FAILURE: {
      return update(state, {
        isLoading: { $set: false },
      });
    }
    default:
      return state;
  }
}

/*--------- SAGAS ---------*/
function* getCommentsFromPost({ category, author, permlink }) {
  try {
    const state = yield steem.api.getStateAsync(`/${category}/@${author}/${permlink}`);
    const posts = yield select(selectPosts());

    const active_voters = {}
    Object.keys(state.content).map((commentKey) => {
      const comment = state.content[commentKey];
      active_voters[`${comment.id}`] = comment.active_votes.map((voter) => { return voter.voter })
      return true;
    });
    const res = yield api.post('/comments/scores.json', { active_voters: JSON.stringify(active_voters) });
    const { score_table } = res;
    // Update payout_value
    const commentsData = mapCommentsBasedOnId(state.content);
    for (const content of Object.values(commentsData)) {
      if (content) {
        content.payout_value = calculateContentPayout(content); // Sync with local format
        content.scores = score_table[content.id];
      }
    }

    // Refresh post if necessary
    const postKey = `${author}/${permlink}`;
    const post = state.content[postKey];

    if (!post || post.id === 0) {
      throw new Error('No content found on the Steem Blockchain. Please try updating your hunt to re-submit to the blockchain.');
    }

    if (posts && posts[postKey] && hasUpdated(posts[postKey], post) && !posts[postKey].isUpdating) {
      // Update posts cache (on api) with the fresh blockchain data
      yield put(postRefreshBegin(post));
    } else {
      yield put(postRefreshSuccess(post));
    }

    yield put(getCommentsFromPostSuccess(`${author}/${permlink}`, state));
  } catch(e) {
    yield notification['error']({ message: e.message });
    yield put(getCommentsFromPostFailure(e.message));
  }
}

export default function* getCommentsFromPostManager() {
  yield takeEvery(GET_COMMENTS_FROM_POST_BEGIN, getCommentsFromPost);
}
