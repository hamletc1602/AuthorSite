import React from 'react'
import ReactDOM from 'react-dom'
import BooksSlider from './booksSlider.jsx'
import TextSlider from './textSlider.jsx'
import CopyToClipboard from './copyToClipboard.jsx'
import FeedbackButton from './feedback.jsx'
import breakpoints from './breakpoints.json'
import authorMap from './authorMap.json'


textCollapse();
bookLists();
feedback();
copyToClipboard();

// Rendering support //////////////////////////////////////////////////////////

/* Disable theme select. Not very useful now we have local builds. Will likely repurpose this kind of UI for
   notifications like "sign up for email list!"
function themeSelection() {
    // Render theme selection buttons
    ReactDOM.render(<ThemeSelector themes={skins} />, document.getElementById('themeSelect'))
}
*/

function bookLists() {
    const bookSliderSettings = {
      responsive: [{
        breakpoint: breakpoints.widthXXl,
        settings: {
          slidesToScroll: 6
        }
      },{
        breakpoint: breakpoints.widthXl,
        settings: {
          slidesToScroll: 5
        }
      },{
        breakpoint: breakpoints.widthLg,
        settings: {
          slidesToScroll: 4
        }
      },{
        breakpoint: breakpoints.widthMd,
        settings: {
          slidesToScroll: 3
        }
      },{
        breakpoint: breakpoints.widthSm,
        settings: {
          slidesToScroll: 2,
          arrows: false
        }
      },{
        breakpoint: breakpoints.widthXSm,
        settings: {
          slidesToScroll: 2,
          arrows: false
        }
      }]
    }

    // Render book lists
    Object.keys(authorMap).map(authorName => {
      let author = authorMap[authorName]
      let allPubs = [];

      // Books list by author.
      if (author.pubs) {
        Object.keys(author.pubs).map(typeName => {
          let pub = author.pubs[typeName]
          allPubs.push(...pub.list)

          let elem = document.getElementById(author.id + '_' + pub.typePlural);
          if (elem && pub.list.length > 2) {
            let overlayText = elem.getAttribute('data-overlayText');
            if (overlayText) {
              let overlayParts = overlayText.split('/');
              bookSliderSettings.overlayPublished = overlayParts[0];
              bookSliderSettings.overlayUnpublished = overlayParts[1];
            }
            bookSliderSettings.showTitles = pub.showTitles;
            ReactDOM.render(<BooksSlider settings={bookSliderSettings} books={pub.list} />, elem);
          }
        })

        let elem = document.getElementById(author.id + '_pubs');
        if (elem && allPubs.length > 2) {
          let overlayText = elem.getAttribute('data-overlayText');
          if (overlayText) {
            let overlayParts = overlayText.split('/');
            bookSliderSettings.overlayPublished = overlayParts[0]
            bookSliderSettings.overlayUnpublished = overlayParts[1]
          }
          bookSliderSettings.showTitles = author.pubs[0].showTitles;
          ReactDOM.render(<BooksSlider settings={bookSliderSettings} books={allPubs} />, elem);
        }
      }

    })
}

function textCollapse() {
    // Render text collapsing sliders
    let elems = [...document.getElementsByClassName('textSlider')];
    elems.forEach(elem => {
        let settings = {
          collapse: true,
          minHeight: 200,
          collapseText: '... (show more)',
          expandText: '(show less)'
        }

        let contentElem = elem.getElementsByTagName('div')[0];

        let collapseStr = elem.getAttribute('sliderStartCollapsed')
        let collapseTextStr = elem.getAttribute('sliderMCollapsedText')
        let expandTextStr = elem.getAttribute('sliderExpandedText')
        let minHeightStr = elem.getAttribute('sliderMinHeight')
        let maxHeightStr = elem.getAttribute('sliderMaxHeight')

        if (collapseStr) {
          settings.collapse = !!collapseStr
        }
        if (collapseTextStr) {
          settings.collapseText = collapseTextStr
        }
        if (expandTextStr) {
          settings.expandText = expandTextStr
        }

        if (minHeightStr) {
          settings.minHeight = Number(minHeightStr)
        }

        // Get the total height of all child elements included in the static min height
        // bounding box. The full height of the last, partial element, is included.
        let minHeightTarget = settings.minHeight
        let minHeight = 0
        let childNodes = contentElem.childNodes
        let i = 0
        for (i = 0; i < childNodes.length; i++) {
          let node = childNodes[i]
          if (node.offsetHeight) {
            minHeight += node.offsetHeight + 16
          }
          if (minHeight >= minHeightTarget) {
            break;
          }
        }
        settings.minHeight = minHeight + 16

        // Get the static height, or calculate the total height of all client elements,
        // TODO: A problem with this code, is that the height is calced on page load, not when the slider is
        // opened, so it will be too tall/short if the page is resized wider/narrower after load.
        if (maxHeightStr) {
          settings.maxHeight = Number(maxHeightStr)
        } else {
            let maxHeight = 0
            let childNodes = contentElem.childNodes
            let i = 0
            for (i = 0; i < childNodes.length; i++) {
              let node = childNodes[i]
              if (node.offsetHeight) {
                maxHeight += node.offsetHeight + 16
              }
            }
            settings.maxHeight = maxHeight + 16
            settings.maxHeight = maxHeight + 50  // Add a little extra height to avoid scrollbar
        }

        // Get text of the inner div (erases the div since we don't want the static styling)
        let content = contentElem.innerHTML;

        ReactDOM.render(<TextSlider settings={settings} text={content} />, elem);
    }, this);
  }

  function copyToClipboard() {
    let elems = [...document.getElementsByClassName('copyToClipboard')];
    elems.forEach(elem => {
        ReactDOM.render(<CopyToClipboard
          textToCopy={elem.getAttribute('textToCopy')}
          displayName={elem.textContent}
        />, elem);
    }, this);
  }

  function feedback() {
    let elems = [...document.getElementsByClassName('feedbackButton')];
    elems.forEach(elem => {
        ReactDOM.render(<FeedbackButton
          classPrefix={elem.getAttribute('classPrefix')}
          successMessage={elem.getAttribute('successMessage')}
          buttonText={elem.textContent}
        />, elem);
    }, this);
  }