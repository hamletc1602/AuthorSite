import React from 'react'
import ReactDOM from 'react-dom'
import BooksSlider from './booksSlider.jsx'
import CopyToClipboard from './copyToClipboard.jsx'
import FeedbackButton from './feedback.jsx'
import breakpoints from './breakpoints.json'
import authorMap from './authorMap.json'

bookLists();
feedback();
copyToClipboard();

// Rendering support //////////////////////////////////////////////////////////

function bookLists() {
    const bookSliderSettings = {
      responsive: [{
        breakpoint: breakpoints.widthXXl,
        settings: {
          slidesToScroll: 4
        }
      },{
        breakpoint: breakpoints.widthXl,
        settings: {
          slidesToScroll: 4
        }
      },{
        breakpoint: breakpoints.widthLg,
        settings: {
          slidesToScroll: 3
        }
      },{
        breakpoint: breakpoints.widthMd,
        settings: {
          slidesToScroll: 3
        }
      },{
        breakpoint: breakpoints.widthSm,
        settings: {
          slidesToScroll: 2
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
      // Books by type
      if (author.pubs) {
        author.pubs.map(pub => {
          const elemId = author.id + '_' + pub.pubType
          const elem = document.getElementById(elemId);
          if (elem) {
            //console.log('Found bookslider elem for: ' + elemId)
            updateSettings(bookSliderSettings, elem)
            bookSliderSettings.showTitles = false;
            ReactDOM.render(<BooksSlider settings={bookSliderSettings} books={pub.list} />, elem);
          } else {
            //console.log('Unable to find bookslider elem for: ' + elemId)
          }
        })
      }
      // All books list
      let elem = document.getElementById(author.id + '_pubs');
      if (elem) {
        updateSettings(bookSliderSettings, elem)
        bookSliderSettings.showTitles = author.showTitles;
        ReactDOM.render(<BooksSlider settings={bookSliderSettings} books={author.list} />, elem);
      }
    })
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
