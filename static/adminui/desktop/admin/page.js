let authSecret = null
let lastETag = null
let maxPollingLoopCount = 30  // Default refresh each 30s

onload = function() {
  // Event handlers
  document.getElementById('auth-save').onclick = function(ev) {
    authSecret = document.getElementById('auth-secret').value
  }
  //
  refresh('admin')
  // Variable speed page refresh
  let pollLoopCount = 0
  setInterval(function() {
    if (pollLoopCount >= maxPollingLoopCount) {
      refresh('admin')
      pollLoopCount = 0
    }
    ++pollLoopCount
  }, 1000)
}

/** Start refresh each second */
function startFastPolling() {
  maxPollingLoopCount = 1
}

/** Return to refresh each 30 seconds */
function endFastPolling() {
  maxPollingLoopCount = 30
}

/** refresh one dynamic section of the page. */
function refresh(sectionName) {
  // Get latest admin data
  return fetch('/admin/admin.json')
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      // Skip page update if the etag has not changed since the last response (ie. must be cached)
      const etag = response.headers.get('etag')
      if (lastETag === null || etag !== lastETag) {
        lastETag = etag
        // transform to html and insert into page
        var data = await response.json()
        var template = Handlebars.templates[sectionName]
        if ( ! (data.display.deploying || data.display.building)) {
          // If niether deploying or building, turn off fast polling
          endFastPolling()
        }
        setInnerHtml(document.getElementById(sectionName + 'Section'), template(data))
      }
    })
}

/** A helper function that ensures embedded scripts are run when inserting HTML into the DOM.
    From: https://stackoverflow.com/questions/2592092/executing-script-elements-inserted-with-innerhtml
*/
function setInnerHtml(elm, html) {
  elm.innerHTML = html;
  Array.from(elm.querySelectorAll("script")).forEach( oldScript => {
    const newScript = document.createElement("script");
    Array.from(oldScript.attributes)
      .forEach( attr => newScript.setAttribute(attr.name, attr.value) );
    newScript.appendChild(document.createTextNode(oldScript.innerHTML));
    oldScript.parentNode.replaceChild(newScript, oldScript);
  });
}

function sendCommand(id, name, params) {
  return fetch('/admin/command/' + name, {
    method: 'POST',
    cache: 'no-cache',
    headers: new Headers({
      'Authorization': 'BASIC ' + btoa('admin:' + authSecret)
    })
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    console.log(response.status + ': ' + JSON.stringify(response))
    startFastPolling()
  })
}
