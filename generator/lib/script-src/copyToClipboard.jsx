import React from 'react'

export default class CopyToClipboard extends React.Component {
  constructor(props) {
    super(props)
    this.displayName = props.displayName && props.displayName.length > 0 ? props.displayName : 'Copy To Clipboard'
    this.textToCopy = props.textToCopy
  }

  // componentDidMount() {
  //   console.log('CopyToClipboard: in componentDidMount')
  // }

  copyToClipboard(event) {
    console.log("CopyToClipboard: in copyToClipboard")
    if (window.isSecureContext) {
      if (Navigator.clipboard) {
        console.log("Attempting to paste: " + this.content + " to clipboard.")
        Navigator.clipboard.writeText(this.content)
          .then(() => console.log('text copied!'))
          .catch((err) => console.log("Clipboard is not accessible! Error: " + err))
      } else {
        console.log("Clipboard is not accessible!")
      }
    } else {
      console.log("Clipboard is not accessible in this context. Try using HTTPS.")
    }
    if (event) {
      event.preventDefault()
    }
    return false;
  }

  cancel(event) {
    if (event) {
      event.preventDefault()
    }
    return false;
  }

  render() {
    console.log('CopyToClipBoard: In Render. Is Secure:' + window.isSecureContext + ' Have Clipboard: ' + Navigator.clipboard + JSON.stringify(this.props))
    if (window.isSecureContext && Navigator.clipboard) {
      return (
        <a href="#" className={`copyToClipbaord`} onClick={this.copyToClipboard}>{this.displayName}</a>
      );
    } else {
      return (
        <a href={this.textToCopy} className={`copyToClipbaordDisabled`} onClick={this.cancel}>{this.displayName}</a>
      );
    }
  }
}
