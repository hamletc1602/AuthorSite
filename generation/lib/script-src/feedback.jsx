import React from 'react'
import Axios from 'axios'

export default class FeedbackButton extends React.Component {
  constructor(props) {
    super(props)
    this.send = this.send.bind(this)
    this.state = Object.assign({}, props)
    this.state.message = ''
    this.state.messageClass = 'hidden'
    this.errorMsg = 'Encountered a problem sending feedback. Please try again later!'
    this.displayTimeout = 10 * 1000
    this.resendTimeout = 5 * 1000
  }

  send(event) {
    this.setState({
      messageClass: 'sending',
      message: 'Sending feedback...',
    })
    const elems = document.getElementsByClassName(this.state.classPrefix + 'include')
    const feedback = []
    Array.from(elems).forEach(elem => {
      const fieldName = elem.getAttribute('name')
      if (fieldName) {
        feedback.push({
          name: fieldName,
          value: elem.value || elem.innerHTML
        })
      }
    })
    Axios.post('/feedback/contact', { feedback: feedback })
      .then(resp => {
        this.setState({
          messageClass: 'done',
          message: this.state.successMessage,
        })
        setTimeout(() => {
          this.setState({ messageClass: 'hidden', message: '' })
        }, this.displayTimeout)
      })
      .catch(error => {
        if (error.response) {
          if (error.response.status !== 429) {
            this.setState({
              messageClass: 'error',
              message: this.errorMsg,
            })
          } else {
            setTimeout(() => {
              this.send()
            }, this.resendTimeout)
          }
        } else {
          console.error('Error sending feedback: ' + JSON.stringify(error))
          this.setState({
            messageClass: 'error',
            message: this.errorMsg,
          })
        }
        setTimeout(() => {
          this.setState({ messageClass: 'hidden', message: '' })
        }, this.displayTimeout)
      })
  }

  render() {
    return (
        <div className={'feedbackButton'}>
          <a href="#" className={`fb_buttonUi`} onClick={this.send} >{this.state.buttonText}</a>
          <div className={`fb_status ${this.state.messageClass}`}>
            <div className={'fb_statusInner'}>{this.state.message}</div>
          </div>
        </div>
    );
  }
}
