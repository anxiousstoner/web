import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { Popover, Icon } from 'antd';
import { sortVotes } from 'utils/helpers/voteHelpers';
import VotePayout from 'features/Vote/VotePayout';
import Author from 'components/Author';
import { formatNumber, formatAmount } from 'utils/helpers/steemitHelpers';

const NB_SHOW_VOTES = 15;

export default class ContentPayoutAndVotes extends PureComponent {
  static propTypes = {
    content: PropTypes.object.isRequired,
    type: PropTypes.string.isRequired,
  };

  render() {
    const { content, type } = this.props;

    let activeVotes = content.active_votes || [];
    if (activeVotes.length === 0) {
      return (
        <span className="vote-count">
          <span className="fake-link hover-link">
            {content.active_votes === undefined ?
              <Icon type="loading" />
              :
              '0'
            }
            &nbsp;votes
          </span>
        </span>
      );
    }
    activeVotes = activeVotes.filter(v => v.percent !== 0);

    // Generate voting-details
    const totalRshares = activeVotes.reduce((total, vote) => total + (parseInt(vote.rshares, 10) || 0), 0);

    // if cashout_time is set (not cashed out yet), use pending_payout_value, otherwise, use total_payout_value
    let totalPayout = 0.0;
    if (content.payout_value) {
      totalPayout = content.payout_value;
    } else if (content.cashout_time) {
      totalPayout = content.cashout_time.indexOf('1969') === -1 ? parseFloat(content.pending_payout_value) : parseFloat(content.total_payout_value);
    }

    const lastVotes = sortVotes(activeVotes, 'rshares').reverse().slice(0, NB_SHOW_VOTES);
    const lastVotesTooltipMsg = lastVotes.map(vote => (
      <div className="voting-list" key={vote.voter}>
        <Author name={vote.voter} />
        <span className="weight">({vote.percent / 100}%)</span>
        <VotePayout vote={vote} totalRshares={totalRshares} totalPayout={totalPayout} />
      </div>
    ));
    if (activeVotes.length > NB_SHOW_VOTES) lastVotesTooltipMsg.push(
      <div key="...">
        ... and <strong>{activeVotes.length - NB_SHOW_VOTES}</strong> more votes.
      </div>
    );

    let validVotes = [];
    let lastValidVotesTooltipMsg = '';
    if (type === 'post') {
      validVotes = content.valid_votes || [];
      const lastValidVotes = sortVotes(validVotes, 'score').reverse().slice(0, NB_SHOW_VOTES);
      lastValidVotesTooltipMsg = lastValidVotes.map(vote => (
        <div className="voting-list" key={vote.voter}>
          <Author name={vote.voter} />
          <span className="weight">({vote.percent / 100}%)</span>
          <span className="value">+{formatNumber(vote.score)}</span>
        </div>
      ));
      if (validVotes.length > NB_SHOW_VOTES) lastValidVotesTooltipMsg.push(
        <div key="...">
          ... and <strong>{validVotes.length - NB_SHOW_VOTES}</strong> more votes.
        </div>
      );
    }

    let userScoresTooltipMsg = '';
    if (type === 'comment') {
      const userScoreTable = content.scores.user_scores;
      const activeVotes = content.active_votes || [];

      const lastActiveVotes = activeVotes.sort((a, b) => userScoreTable[a.voter] - userScoreTable[b.voter]).reverse().slice(0, NB_SHOW_VOTES);
      userScoresTooltipMsg = lastActiveVotes.map(vote => (
        <div className="voting-list" key={vote.voter}>
          <Author name={vote.voter} />
          <span className="weight">({vote.percent / 100}%)</span>
          <span className="value">+{formatNumber(userScoreTable[vote.voter])}</span>
        </div>
      ));
    }

    if (type === 'post') {
      return (
        <span className="vote-count">
          <Popover content={lastVotesTooltipMsg} placement="bottom">
            <span className="payout fake-link">{formatAmount(content.payout_value)}</span>
          </Popover>
          <span className="separator">&middot;</span>
          <Popover content={lastValidVotesTooltipMsg} placement="bottom">
            <span className="fake-link">{`${validVotes.length} votes`}</span>
          </Popover>
        </span>
      );
    } else { // comment
      return (
        <span className="vote-count">
          <Popover content={userScoresTooltipMsg} placement="bottom">
            <span className="payout fake-link">{formatNumber(content.scores.total)}</span>
          </Popover>
          <span className="separator">|</span>
          <Popover content={lastVotesTooltipMsg} placement="bottom">
            <span className="fake-link hover-link">{formatAmount(content.payout_value)}</span>
          </Popover>
        </span>
      );
    }
  }
}
