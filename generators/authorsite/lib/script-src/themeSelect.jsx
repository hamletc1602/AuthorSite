import React from 'react'
import Cookies from 'universal-cookie'


export default class ThemeSelector extends React.Component {
  constructor(props) {
    super(props)
    this.state = { settings: props.settings, themes: props.themes }

    let cookies = new Cookies()
    let themeClassName = cookies.get("theme")
    if (themeClassName) {
        document.body.setAttribute('class', themeClassName)
    }
  }

  render() {
    return (
        this.state.themes.map((theme, index) => {
            if (theme.active) {
                return (
                    <ThemeSelectButton key={theme.shortName} settings={this.state.settings} theme={theme} />
                )
            }
        })
    );
  }
}


export class ThemeSelectButton extends React.Component {
  constructor(props) {
    super(props)
    this.state = { settings: props.settings, theme: props.theme }
    this.setTheme = this.setTheme.bind(this);
  }

  setTheme(event) {
      console.log(`Set site theme to: ${this.state.theme.className}`)
      document.body.setAttribute('class', this.state.theme.className)
      let cookies = new Cookies()
      let expiry = new Date(new Date().getTime() + (1000 * 60 * 60 * 24 * 31))
      cookies.set('theme', this.state.theme.className, { path: '/', expires: expiry })
  }

  render() {
    let theme = this.state.theme
    return (
        <a href="#" className={`themebtn themebtn-${theme.className}`} onClick={this.setTheme} >
            <span className="short">{theme.shortName}</span>
            <span className="long" onClick={this.setTheme} >{theme.displayName}</span>
        </a>
    );
  }
}
