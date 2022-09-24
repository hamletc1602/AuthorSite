import React from 'react';
import ReactTextCollapse from "react-text-collapse";


export default class TextSlider extends React.Component {
  constructor(props) {
    super(props)
    this.state = { settings: props.settings, text: props.text }
  }
  render() {
    var settings = {
      ...this.state.settings,
    }
    return (
        <ReactTextCollapse options = {settings} >
            <div dangerouslySetInnerHTML={{ __html: this.state.text }}></div>
        </ReactTextCollapse>
    );
  }
}
