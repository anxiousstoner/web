import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { createStructuredSelector } from 'reselect';
import { connect } from 'react-redux';
import { Form, Row, Col, Input, InputNumber, Tooltip, Icon, Button, Modal, Spin, notification } from 'antd';
import { selectDraft, selectIsPublishing } from './selectors';
import { selectMe } from 'features/User/selectors';
import { publishContentBegin } from './actions/publishContent';
import { updateDraft, resetDraft } from './actions/updateDraft';
import { initialState } from './actions';
import { timeUntilMidnightSeoul } from 'utils/date';
import api from 'utils/api';
import { selectCurrentPost } from './selectors';
import { getPostBegin, setCurrentPostKey } from './actions/getPost';
import { sanitizeText, splitTags } from './utils';
import { getCachedImage, stripCachedURL } from 'features/Post/utils';
import CustomUploadDragger from 'components/CustomUploadDragger';
import { uploadImage, validateImage } from 'utils/helpers/uploadHelpers';

const FormItem = Form.Item;
let currentBeneficiaryId = 0;

class PostForm extends Component {
  static propTypes = {
    me: PropTypes.string.isRequired,
    draft: PropTypes.object.isRequired,
    updateDraft: PropTypes.func.isRequired,
    resetDraft: PropTypes.func.isRequired,
    publishContent: PropTypes.func.isRequired,
    isPublishing: PropTypes.bool.isRequired,
  };

  constructor(props) {
    super(props);

    this.state = {
      editMode: false,
      resetted: false,
      previewImageVisible: false,
      previewImage: '',
      fileList: [],
      uploadError: null,
      beneficiariesValid: true,
      shouldRecalculateBeneficiary: false,
      duplicatedUrl: null,
      description: '',
      inlineUploading: false,
    };
    this.beneficiaryInput = {};
  }

  componentDidMount() {
    const { match: { params: { author, permlink } }, getPost, updateDraft } = this.props;
    const draftString = localStorage.getItem('draft');

    // Edit mode
    if (author && permlink) {
      if (!!draftString) {
        let draft = JSON.parse(draftString);
        if (author === draft.author && permlink === draft.permlink) {
          // if there is saved localStorage
          updateDraft('url', draft.url);
          updateDraft('title', draft.title);
          updateDraft('tagline', draft.tagline);
          updateDraft('description', draft.description);
          this.setState({
            description: draft.description || ''
          })
          updateDraft('tags', draft.tags);
          if (draft.images !== []) {
            updateDraft('images', draft.image);
            this.handleImageChange({ fileList: draft.images });
            this.prepareForEdit(draft);
          }
        } else {
          getPost(author, permlink);
        }
      } else {
        getPost(author, permlink);
      }
      this.setState({ editMode: true, resetted: false });

      // Fresh new post
    } else if (!draftString) {
      // if localStorage does not exist
      this.checkAndResetDraft();

      // New post with draft
    } else {
      // if there is saved localStorage
      let draft = JSON.parse(draftString);
      updateDraft('url', draft.url || '#');
      updateDraft('title', draft.title || 'Title');
      updateDraft('tagline', draft.tagline || 'Short Description');
      updateDraft('tags', draft.tags || []);
      updateDraft('description', draft.description || '');
      this.setState({
        description: draft.description || ''
      })
      if (draft.images !== []) {
        updateDraft('images', draft.image);
        this.handleImageChange({ fileList: draft.images });
        this.prepareForEdit(draft);
      }
    }

    if (this.props.me) {
      this.saveAndUpdateDraft('author', this.props.me);
    }

    window.onbeforeunload = function() {
      return "Leave site? Changes you made may not be saved.";
    }
  }

  componentWillUnmount() {
    const { match: { params: { author, permlink } }} = this.props;

    if (author && permlink) {
      this.props.resetDraft();
      localStorage.removeItem('draft');
    } else {
      this.checkAndResetDraft();
    }

    window.onbeforeunload = null;
  }

  componentWillReceiveProps(nextProps) {
    const { match: { params: { author, permlink } } } = this.props;
    const nextAuthor = nextProps.match.params.author;
    const nextPermlink = nextProps.match.params.permlink;

    if (nextAuthor && nextPermlink) {
      if (author !== nextAuthor || permlink !== nextPermlink) {
        this.props.getPost(nextAuthor, nextPermlink);
      }
      this.setState({ editMode: true, resetted: false });

      if (this.props.draft.permlink !== nextProps.draft.permlink) {
        this.prepareForEdit(nextProps.draft);
      }
    } else {
      if (author && permlink) {
        this.props.resetDraft();
        localStorage.removeItem('draft');
      } else if (!localStorage.getItem('draft')) {
        this.setState({ editMode: false });
        this.checkAndResetDraft();
      }
    }
  }

  componentDidUpdate() {
    if (this.state.shouldRecalculateBeneficiary) {
      this.onBeneficiariesChanged();
    }
  }

  saveAndUpdateDraft = (field, value) => {
    this.props.updateDraft(field, value);

    // TODO: FIXME: HACK:
    // Should be a proper reducer callback
    setTimeout(() => {
      // Save into localStorage
      localStorage.setItem('draft', JSON.stringify(this.props.draft));
    });
  }

  checkAndResetDraft = () => {
    if (!this.state.resetted) {
      this.props.setCurrentPostKey(null);
      this.props.resetDraft();
      this.setState({ resetted: true, fileList: [] });
    }
  };

  prepareForEdit = (draft) => {
    this.saveAndUpdateDraft('permlink', draft.permlink);
    this.setState({
      fileList: draft.images.map((f, i) => f &&
        {
          uid: i,
          name: f.name,
          url: getCachedImage(f.link),
          status: 'done',
          link: f.link,
        }
      ),
    });
  };

  handleSubmit = (e) => {
    e.preventDefault();

    this.props.form.validateFieldsAndScroll();
    this.props.publishContent(this.state.editMode);
  };

  // MARK: - Beneficiaries
  // TODO: Refactor into a component

  onBeneficiariesChanged = () => {
    // TODO: FIXME: HACK:
    // value is one step behind because maybe the inputNumberRef doesn't set synchronously
    setTimeout(() => {
      const { form } = this.props;
      const beneficiaryIds = form.getFieldValue('beneficiaryIds');

      let weightSum = 0;
      let beneficiaries = [];
      for (const i of beneficiaryIds) {
        const account = this.beneficiaryInput[i]['accountInput'].input.value;
        const weight = this.beneficiaryInput[i]['weightInput'].inputNumberRef.getCurrentValidValue();
        beneficiaries.push({ account: account, weight: weight * 100 });
        weightSum += weight;
      }
      this.saveAndUpdateDraft('beneficiaries', beneficiaries);

      if (weightSum > 85 || weightSum < 0) {
        this.setState({ beneficiariesValid: false });
      } else {
        this.setState({ beneficiariesValid: true });
      }
    }, 50);

    this.setState({ shouldRecalculateBeneficiary: false });
  };

  removeBeneficiary = (k) => {
    const { form } = this.props;
    // can use data-binding to get
    const beneficiaryIds = form.getFieldValue('beneficiaryIds');

    // can use data-binding to set
    form.setFieldsValue({
      beneficiaryIds: beneficiaryIds.filter(key => key !== k),
    });

    this.setState({ shouldRecalculateBeneficiary: true });
  };

  addBeneficiary = () => {
    currentBeneficiaryId++;
    const { form } = this.props;
    // can use data-binding to get
    const beneficiaryIds = form.getFieldValue('beneficiaryIds');
    const nextIds = beneficiaryIds.concat(currentBeneficiaryId);
    // can use data-binding to set
    // important! notify form to detect changes
    form.setFieldsValue({
      beneficiaryIds: nextIds,
    });

    this.setState({ shouldRecalculateBeneficiary: true });
  };

  // MARK: - Custom Validators

  checkTags = (_, value, callback) => {
    const form = this.props.form;
    const tags = splitTags(form.getFieldValue('tags'));

    if (tags.length > 4) {
      callback('Please use only 4 tags');
    } else {
      this.handleTagsChange(tags);
      callback();
    }
  };

  checkImages = (_, value, callback) => {
    if (this.state.fileList.length > 0) {
      callback();
    } else {
      callback('You must upload at least one image');
    }
  };

  checkUrl = (_, value, callback) => {
    this.setState({ duplicatedUrl: null });

    if (!value || value.length === 0) {
      return callback();
    }

    if (this.state.editMode) {
      this.saveAndUpdateDraft('url', value);
      return callback();
    }

    api.get('/posts/exists.json', { url: value }, true).then((res) => {
      if (res.result === 'OK') {
        this.saveAndUpdateDraft('url', value);
        callback();
      } else {
        this.saveAndUpdateDraft('url', '#');
        if (res.url) {
          this.setState({ duplicatedUrl: res.url });
          callback('');
        } else {
          callback(res.result);
        }
      }
    }).catch(msg => {
      this.saveAndUpdateDraft('url', '#');
      callback('Service is temporarily unavailable, Please try again later.');
    });
  };

  handleImagePreviewCancel = () => this.setState({ previewVisible: false });
  handleImagePreview = (file) => {
    this.setState({
      previewImage: file.url || file.thumbUrl,
      previewVisible: true,
    });
  };

  // MARK: - Handle live updates

  handleTitleChange = (e) => this.saveAndUpdateDraft('title', sanitizeText(e.target.value, true) || initialState.draft.title);
  handleTaglineChange = (e) => this.saveAndUpdateDraft('tagline', sanitizeText(e.target.value, true) || initialState.draft.tagline);
  handleDescriptionChange = (e, text = null) => {
    this.setState({
      description: text || e.target.value
    }, () => this.saveAndUpdateDraft('description', sanitizeText(this.state.description) || initialState.draft.description));
  };
  handleImageChange = ({ file, fileList }) => {
    const images = fileList.map(function (f) {
      if (f.response && f.response.link) {
        return {
          name: f.response.name,
          link: f.response.link
        }
      } else if (f.name && f.link) { // Handle Edit
        return {
          name: f.name,
          link: stripCachedURL(f.link)
        }
      }
      return null;
    });
    // console.log(file, fileList);
    this.setState({ fileList: fileList.filter(f => f.status === "done" || f.status === "uploading") });
    this.saveAndUpdateDraft('images', images.filter(x => !!x));
  };
  handleTagsChange = (tags) => this.saveAndUpdateDraft('tags', tags);

  initialValue = (field, defaultValue = null) => initialState.draft[field] === this.props.draft[field] ? defaultValue : this.props.draft[field];

  onXhrUploadSuccess = (res, onSuccess, file) => {
    const { response } = res.data;
    const result = {
      uid: response.uid,
      url: getCachedImage(response.link),
      name: response.name,
      link: response.link,
      status: 'done'
    };
    onSuccess(result, file);
  }

  getErrorMessage(e) {
    if (e && e.response && e.response.data && e.response.data.error) {
      return e.response.data.error;
    } else {
      console.error('Upload error', e);
      return 'Image upload failed. Please check your Internet connection.';
    }
  }

  onXhrUploadFail = (e, file) => {
    notification['error']({ message: this.getErrorMessage(e) });
    this.setState({ fileList: this.state.fileList.filter(f => f.name !== file.name) });
  }

  onXhrUploadProgress = (onProgress, total, loaded, file) => {
    onProgress({ percent: parseFloat(Math.round(loaded / total * 100).toFixed(2)) }, file);
  }

  xhrUpload = ({ file, onProgress, onSuccess}) => {
    // console.log(file, this.state.fileList, "=====xhrUpload=====");
    if (!uploadImage(
      file,
      (res) => this.onXhrUploadSuccess(res, onSuccess, file),
      (res) => this.onXhrUploadFail(res, file),
      ({total, loaded}) => this.onXhrUploadProgress(onProgress, total, loaded, file)
    )) {
      return false;
    }
  }

  onInlineUploadSuccess = (res) => {
    const { response } = res.data;
    const { selectionStart, innerHTML } = this.descriptionRef.textAreaRef;
    const text = innerHTML.slice(0, selectionStart)
      + `![${response.name}](${getCachedImage(response.link)})`
      + innerHTML.slice(selectionStart + 1);
    this.handleDescriptionChange(null, text);
  }

  onInlineUploadFail = (e) => {
    notification['error']({ message: this.getErrorMessage(e) });
  }

  inputUpload = (e) => {
    const file = e.target.files[0];
    this.setState({ inlineUploading: true }, () => {
      uploadImage(file, this.onInlineUploadSuccess, this.onInlineUploadFail)
      .then(() => this.setState({ inlineUploading: false }));
    });
  }

  render() {
    if (!this.props.me) {
      return (<Spin className="center-loading" />);
    }

    if (this.props.post && this.props.post.author !== this.props.me) {
      return (
        <div className="heading left-padded">
          <h3>Forbidden</h3>
          <div className="heading-sub">
            You don&apos;t have permission to edit this post.
          </div>
        </div>
      );
    }

    const { getFieldDecorator, getFieldValue } = this.props.form;
    const formItemLayout = {
      labelCol: {
        lg: { span: 24 },
        xl: { span: 6 },
      },
      wrapperCol: {
        lg: { span: 24 },
        xl: { span: 18 },
      },
    };
    const formItemLayoutWithOutLabel = {
      wrapperCol: {
        lg: { span: 24, offset: 0 },
        xl: { span: 18, offset: 6 },
      },
    };

    getFieldDecorator('beneficiaryIds', { initialValue: [] });
    const beneficiaryIds = getFieldValue('beneficiaryIds');
    const beneficiaries = beneficiaryIds.map((k, index) => {
      this.beneficiaryInput[k] = { accountInput: null, weightInput: null };

      return (
        <FormItem
          {...(index === 0 ? formItemLayout : formItemLayoutWithOutLabel)}
          label={index === 0 ? (
            <span>
              Contributors&nbsp;
              <Tooltip title="You can add other beneficiaries from your post">
                <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          ) : ''}
          required={false}
          key={k}
        >
          <Row gutter={8}>
            <Col span={14}>
              <Input
                addonBefore="@"
                placeholder="steemhunt"
                className="beneficiaries"
                ref={node => this.beneficiaryInput[k]['accountInput'] = node}
                onChange={this.onBeneficiariesChanged}
                maxLength="16"
              />
            </Col>
            <Col span={10}>
              <InputNumber
                min={1}
                max={85}
                formatter={value => `${value}%`}
                parser={value => value.replace('%', '')}
                onChange={this.onBeneficiariesChanged}
                ref={el => { this.beneficiaryInput[k]['weightInput'] = el; }}
                defaultValue={20}
              />
              <Icon
                className="delete-button"
                type="minus-circle-o"
                disabled={beneficiaryIds.length === 1}
                onClick={() => this.removeBeneficiary(k)}
              />
            </Col>
          </Row>
        </FormItem>
      );
    });

    return (
      <Form onSubmit={this.handleSubmit} className="post-form">
        <div className="guideline"><a href="https://github.com/Steemhunt/web/blob/master/POSTING_GUIDELINES.md" target="_blank" rel="noopener noreferrer">Posting Guidelines</a></div>
        <FormItem
          {...formItemLayout}
          label="Product Link"
        >
          {getFieldDecorator('url', {
            validateTrigger: ['onBlur'],
            initialValue: this.initialValue('url'),
            rules: [
              { required: true, message: 'Product link cannot be empty', whitespace: true },
              { validator: this.checkUrl },
            ],
          })(
            <Input placeholder="https://steemit.com" />
          )}
          {this.state.duplicatedUrl &&
            <div className="ant-form-explain">
              The product link already exists&nbsp;
              <a href={this.state.duplicatedUrl} target="_blank" rel="noopener noreferrer">(Link)</a>.
            </div>
          }
        </FormItem>

        <FormItem
          {...formItemLayout}
          label="Name of Product"
        >
          {getFieldDecorator('title', {
            initialValue: this.initialValue('title'),
            rules: [{ required: true, message: 'Name cannot be empty', whitespace: true }],
          })(
            <Input
              placeholder="Steemit"
              maxLength="30"
              onChange={this.handleTitleChange} />
          )}
        </FormItem>

        <FormItem
          {...formItemLayout}
          label="Short Description"
          help="Describe what you’re posting in 60 characters or less."
        >
          {getFieldDecorator('tagline', {
            initialValue: this.initialValue('tagline'),
            rules: [{ required: true, message: 'Short description cannot be empty', whitespace: true }],
          })(
            <Input
              placeholder="A social media where everyone gets paid for participation"
              maxLength="60"
              onChange={this.handleTaglineChange}
            />
          )}
        </FormItem>

        <FormItem
          {...formItemLayout}
          label="Images"
        >
          <div className="dropbox">
            {getFieldDecorator('images', {
              rules: [{ validator: this.checkImages }],
            })(
              <CustomUploadDragger name="image"
                customRequest={this.xhrUpload}
                listType="picture-card"
                fileList={this.state.fileList}
                onPreview={this.handleImagePreview}
                onChange={this.handleImageChange}
                multiple={true}
                accept="image/x-png,image/gif,image/jpeg"
                beforeUpload={(file, fileList) => validateImage(file)}
              >
                <p className="ant-upload-drag-icon">
                  <Icon type="inbox" />
                </p>
                <p className="ant-upload-hint">Click or drag image(s) to this area to upload (5MB Max)</p>
              </CustomUploadDragger>
            )}
            {this.state.uploadError &&
              <div className="error">{this.state.uploadError}</div>
            }
          </div>
          <Modal visible={this.state.previewVisible} footer={null} onCancel={this.handleImagePreviewCancel} width="50%" className="preview-modal">
            {
              /\.mp4$/.test(this.state.previewImage) ?
                <video key={this.state.previewImage} alt="Preview" playsInline autoPlay="autoplay" muted loop>
                  <source src={this.state.previewImage} />
                </video> :
                <img key={this.state.previewImage} alt="Preview" style={{ width: '100%' }} src={this.state.previewImage} />
            }
          </Modal>
        </FormItem>

        <FormItem
          {...formItemLayout}
          label="Hunter's comment"
          extra={`${this.props.draft.description.length} / 1000`}
          className="description"
        >
          <Input.TextArea
            ref={(ref) => { this.descriptionRef = ref }}
            placeholder="Comment on this product..."
            rows={4}
            value={this.state.description || this.initialValue('description')}
            onChange={this.handleDescriptionChange}
            maxLength={1000} />
          <div className="inline-upload-container">
            <a onClick={() => this.inlineFileField.click()}>Upload Image</a>
            {this.state.inlineUploading && <Icon type="loading" spin="true" />}
            <input type="file" ref={(ref) => { this.inlineFileField = ref }} onChange={this.inputUpload} accept="image/x-png,image/jpeg" />
          </div>
        </FormItem>
        <FormItem
          {...formItemLayout}
          label="Tags"
        >
          {getFieldDecorator('tags', {
            validateTrigger: ['onChange', 'onBlur'],
            initialValue: this.initialValue('tags', []).join(' '),
            rules: [{ validator: this.checkTags }],
          })(
            <Input
              placeholder="Up to 4 tags, separated by a space"
            />
          )}
        </FormItem>

        {!this.state.editMode && beneficiaries}

        {!this.state.editMode &&
          <FormItem {...formItemLayoutWithOutLabel}>
            {!this.state.beneficiariesValid && (
              <div className="ant-form-item-control has-error">
                <p className="ant-form-explain">Sum of reward values must be less than or equal to 85%</p>
              </div>
            )
            }
            {beneficiaryIds.length < 5 &&
              <Button type="dashed" onClick={this.addBeneficiary}>
                <Icon type="plus" /> Add makers or contributors
              </Button>
            }
            <p className="text-small top-margin">
              10% beneficiaries will be used for Steemhunt operation, and another 5% for sponsors who&nbsp;
              <a href="https://steemit.com/steemhunt/@steemhunt/introducing-incentives-for-steemhunt-sponsors" target="_blank" rel="noopener noreferrer">
                delegated Steem Power to @steemhunt.
              </a>
              <br/>
              {timeUntilMidnightSeoul()}
            </p>
          </FormItem>
        }

        <FormItem {...formItemLayoutWithOutLabel}>
          <Button
            type="primary"
            htmlType="submit"
            className="submit-button pull-right round-border padded-button"
            loading={this.props.isPublishing}
          >
            {this.state.editMode ? 'UPDATE POST' : 'POST NOW'}
          </Button>
        </FormItem>
      </Form>
    );
  }
}

const WrappedPostForm = Form.create()(PostForm);

const mapStateToProps = () => createStructuredSelector({
  me: selectMe(),
  draft: selectDraft(),
  post: selectCurrentPost(),
  isPublishing: selectIsPublishing(),
});

const mapDispatchToProps = (dispatch, props) => ({
  getPost: (author, permlink) => dispatch(getPostBegin(author, permlink, true)),
  setCurrentPostKey: key => dispatch(setCurrentPostKey(key)),
  updateDraft: (field, value) => dispatch(updateDraft(field, value)),
  resetDraft: () => dispatch(resetDraft()),
  publishContent: (editMode) => dispatch(publishContentBegin(props, editMode)),
});

export default connect(mapStateToProps, mapDispatchToProps)(WrappedPostForm);

