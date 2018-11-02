import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { createStructuredSelector } from 'reselect';
import { connect } from 'react-redux';
import { Button, Slider, Popover, Popconfirm, notification } from 'antd';
import { selectIsConnected, selectMyAccount } from 'features/User/selectors';
import { selectAppProps, selectAppRate, selectAppRewardFund } from 'features/App/selectors';
import { voteBegin } from './actions/vote';
import { hasVoted, calculateVotingValue } from 'utils/helpers/steemitHelpers';
import { formatAmount, formatNumber } from 'utils/helpers/steemitHelpers';
import { getLoginURL } from 'utils/token';

class VoteButton extends PureComponent {
  static propTypes = {
    post: PropTypes.object.isRequired,
    type: PropTypes.string.isRequired,
    layout: PropTypes.string.isRequired,
    appProps: PropTypes.object,
    myAccount: PropTypes.object.isRequired,
    isConnected: PropTypes.bool.isRequired,
    vote: PropTypes.func.isRequired,
  };

  constructor() {
    super();
    this.state = {
      voteWeight: 100,
      sliderOpened: false,
    }
  }

  componentDidMount() {
    this.loadVoteWeight();
  }

  loadVoteWeight = () => {
    const voteString = localStorage.getItem(`vote-weight-${this.props.type}`);
    const voteWeight = parseInt(voteString, 10)
    if (voteString && !!voteWeight) {
      this.setState({ voteWeight: voteWeight });
    }
  };

  openSignin = () => {
    notification.open({
      message: 'Login Required',
      description:
        <div>
          Please <a href={getLoginURL()}>Login</a>
          &nbsp;or&nbsp;
          <a
            href="/sign-up"
            onClick={() => window.gtag('event', 'signup_clicked', { 'event_category': 'signup', 'event_label': 'Voting Notification' })}
          >
            Sign Up
          </a> for participating in voting.
        </div>,
    });
  };

  onChangeVotingWeight = value => this.setState({ voteWeight: value });

  doVote = weight => {
    const { isConnected, post, vote, type } = this.props;

    if (isConnected) {
      vote(post, weight, type);
      this.setState({ sliderOpened: false });
    } else {
      console.log('Not logged in');
    }
  };

  handleVisibleChange = (visible) => {
    if (visible) {
      if (!this.props.isConnected) {
        return this.openSignin();
      }
    }
    localStorage.setItem(`vote-weight-${this.props.type}`, this.state.voteWeight);
    this.setState({ sliderOpened: visible });
  };

  votingValueCalculator = voteWeight => {
    const { myAccount, appProps, rewardFund, rate } = this.props;

    return calculateVotingValue(voteWeight, myAccount, appProps, rewardFund, rate);
  };

  render() {
    const { myAccount, isConnected, post, layout } = this.props;
    const { voteWeight, sliderOpened } = this.state;
    const postUpvoted = hasVoted(post, myAccount.name);
    const deleteConfirmation = <div>Are you sure unvote this post?<br />Your voting power won&quot;t recharge even if you unvote.</div>

    const content = isConnected ? (
      <div className="vote-box">
        <Slider
          min={0}
          max={100}
          step={1}
          value={voteWeight}
          onChange={this.onChangeVotingWeight}
        />
        <div className="weight">
          {voteWeight}%
          {layout === 'comment' ?
            ` (${formatAmount(this.votingValueCalculator(voteWeight))})`
            :
            ` (+${formatNumber(voteWeight * myAccount.user_score * 0.01 * myAccount.boost_score)}, ${formatAmount(this.votingValueCalculator(voteWeight))})`
          }
        </div>
        <Button
          type="primary"
          onClick={() => this.doVote(voteWeight * 100)}
          disabled={voteWeight === 0}>
          Vote
        </Button>
      </div>
    ) : '';

    if (layout === 'list') {
      return (
        <div className={`vote-button${postUpvoted ? ' active' : ''}`}>
          {postUpvoted ?
            <Popconfirm
              title={deleteConfirmation}
              onConfirm={() => this.doVote(0)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                type="primary"
                shape="circle"
                icon="up"
                ghost={false}
                loading={post.isUpdating}
              />
            </Popconfirm>
            :
            <Popover
              content={content}
              trigger="click"
              placement="left"
              visible={sliderOpened}
              onVisibleChange={(visible) => this.handleVisibleChange(visible)}
            >
              <Button
                type="primary"
                shape="circle"
                icon="up"
                ghost={true}
                loading={post.isUpdating}
              />
            </Popover>
          }
          <div className="payout-value">{formatNumber(post.hunt_score)}</div>
        </div>
      );
    } else if (layout === 'detail-page') {
      return (
        <div className={`vote-button${postUpvoted ? ' active' : ''}`}>
          {postUpvoted ?
            <Popconfirm
              title={deleteConfirmation}
              onConfirm={() => this.doVote(0)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                type="primary"
                shape="circle"
                ghost={false}
                icon="up"
                loading={post.isUpdating}
              >
                UNVOTE
                <div className="payout-value">{formatNumber(post.hunt_score)}</div>
              </Button>
            </Popconfirm>
            :
            <Popover
              content={content}
              trigger="click"
              placement="top"
              visible={sliderOpened}
              onVisibleChange={(visible) => this.handleVisibleChange(visible)}
            >
              <Button
                type="primary"
                shape="circle"
                ghost={true}
                icon="up"
                loading={post.isUpdating}
              >
                UPVOTE
                <div className="payout-value">{formatNumber(post.hunt_score)}</div>
              </Button>
            </Popover>
          }
        </div>
      );
    } else { // comment
      return (
        <div className={`vote-button${postUpvoted ? ' active' : ''}`}>
          {postUpvoted ?
            <Popconfirm
              title={deleteConfirmation}
              onConfirm={() => this.doVote(0)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                type="primary"
                shape="circle"
                icon="up"
                size="small"
                ghost={false}
                loading={post.isUpdating}
              />
            </Popconfirm>
            :
            <Popover
              content={content}
              trigger="click"
              placement="top"
              visible={sliderOpened}
              onVisibleChange={(visible) => this.handleVisibleChange(visible)}
            >
              <Button
                type="primary"
                shape="circle"
                icon="up"
                size="small"
                ghost={true}
                loading={post.isUpdating}
              />&nbsp;
            </Popover>
          }
          {/* <span className="payout-value">{formatNumber(post.score)}</span> */}
        </div>
      );
    }
  }
}

const mapStateToProps = (state, props) => createStructuredSelector({
  myAccount: selectMyAccount(),
  isConnected: selectIsConnected(),
  appProps: selectAppProps(),
  rate: selectAppRate(),
  rewardFund: selectAppRewardFund(),
});

const mapDispatchToProps = (dispatch, props) => ({
  vote: (post, weight, params) => dispatch(voteBegin(post, weight, props.type)),
});

export default connect(mapStateToProps, mapDispatchToProps)(VoteButton);
