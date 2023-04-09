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

    // Update static slider settings based on current page context, including the data attributes
    // on the component shadow element.
    function updateSettings(settings, elem) {
      const overlayText = elem.getAttribute('data-overlayText');
      if (overlayText) {
        let overlayParts = overlayText.split('/');
        settings.overlayPublished = overlayParts[0];
        settings.overlayUnpublished = overlayParts[1];
      }
      const onClickFuncName = elem.getAttribute('data-onclick');
      if (onClickFuncName) {
        if (window[onClickFuncName]) {
          //console.log('Found bookslider onclick function: ' + onClickFuncName)
          settings.onClick = window[onClickFuncName]
        } else {
          //console.log('Unabled to find bookslider onclick function: ' + onClickFuncName)
        }
      }
    }

    // Render book lists
    Object.keys(authorMap).map(authorName => {
      let author = authorMap[authorName]
      let allPubs = [];

      // Books list by author.
      if (author.pubs) {
        author.pubs.map(pub => {
          allPubs.push(...pub.list)
          const elemId = author.id + '_' + pub.pubType
          const elem = document.getElementById(elemId);
          if (elem) {
            //console.log('Found bookslider elem for: ' + elemId)
            updateSettings(bookSliderSettings, elem)
            bookSliderSettings.showTitles = pub.showTitles;
            ReactDOM.render(<BooksSlider settings={bookSliderSettings} books={pub.list} />, elem);
          } else {
            //console.log('Unable to find bookslider elem for: ' + elemId)
          }
        })

        let elem = document.getElementById(author.id + '_pubs');
        if (elem) {
          updateSettings(bookSliderSettings, elem)
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