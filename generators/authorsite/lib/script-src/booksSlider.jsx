import React from 'react';
import Slider from "react-slick";


export default class BooksSlider extends React.Component {
  constructor(props) {
    super(props)
    this.state = { settings: props.settings, slides: props.books }
  }
  render() {
    var settings = {
      ...this.state.settings,
      dots: false,
      speed: 300,
      slidesToShow: 1,
      slidesToScroll: 1,
      variableWidth: true
    }
    return (
      <Slider {...settings}>
        {
          this.state.slides.map((slide, index) => {

            let overlay = null
            if (slide.published) {
              if (slide.publishedStickerText) {
                if (slide.primaryDistributor) {
                  overlay = <a className="buybook" href={slide.primaryDistributor.url} target="_blank" title={`${slide.primaryDistributor.popupText}`}>{slide.publishedStickerText}</a>
                }
              }
            } else {
              if (slide.unpublishedStickerText) {
                overlay = <div className="comingSoon">{slide.unpublishedStickerText}</div>
              }
            }

            let titleBlock = null
            if (settings.showTitles) {
              titleBlock =  <div class={`bookSubText ${slide.id}CoverIconWidth`} title={`${slide.title} ${slide.logline}`}>{slide.title} {slide.logline}</div>
            }

            if (slide.id) {
              return (
                <div key={slide.id} className={`booklist-item booklist-item${index}`}>
                  { titleBlock }
                  <div className={`bookCoverImage ${slide.id}CoverIcon`}>

                    <a className="bookCoverLink"
                      href={slide.detailsUrl}
                      onClick={settings.onClick ? (ev) => { ev.preventDefault(); settings.onClick(slide.id); } : null}
                      aria-label={slide.title}></a>
                    {
                      overlay
                    }
                  </div>
                </div>
              )
            }
          })
        }
      </Slider>
    );
  }
}
