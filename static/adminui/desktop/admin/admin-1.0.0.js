const FastPollingTimeoutMs = 5 * 60 * 1000

 // Filled by admin content
const adminCache = {}

let lastETag = null
let lockId = ''
let locked = true
let maxPollingLoopCount = 30  // Default refresh each 30s
let fastPollingTimeoutId = null

// Save the current lock ID in local session just before page refresh, for use after refresh.
window.addEventListener("beforeunload", () => {
  sessionStorage.setItem('lockId', lockId)
})

//
onload = function() {
  // Save and populate auth secret on the page
  document.getElementById('auth-save').onclick = function(ev) {
    sessionStorage.setItem('auth-secret', document.getElementById('auth-secret').value)
  }
  document.getElementById('auth-secret').value = sessionStorage.getItem('auth-secret')

  // Get or create lock ID, then remove it from the local session so it's not copied to duplicated tabs
  lockId = sessionStorage.getItem('lockId')
  if (lockId) {
    sessionStorage.removeItem('lockId')
  } else {
    lockId = String(Math.random()).substring(2,10) + String(Math.random()).substring(2,10)
  }

  //
  getLockState()
  this.setInterval(function() {
    getLockState()
  }, 4 * 60 * 1000)

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

/** Lock state polling */
function getLockState() {
  return fetch(`/admin/lock?lockId=${lockId}`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      if (await response.text() === 'unlocked') {
        locked = false
      } else {
        locked = true
      }
      document.body.classList.toggle('locked', locked)
      const elems = document.getElementsByClassName('action')
      for (let i = 0; i < elems.length; ++i) {
        const elem = elems[i]
        elem.classList.toggle('pure-button-disabled', locked)
      }
    })
}

/** Start refresh each second. Only if unlocked. */
function startFastPolling() {
  if ( ! locked) {
    maxPollingLoopCount = 1
    fastPollingTimeoutId = setTimeout(function() {
      endFastPolling()
      fastPollingTimeoutId = null
    }, FastPollingTimeoutMs)
  }
}

/** Return to refresh each 30 seconds */
function endFastPolling() {
  maxPollingLoopCount = 30
  if (fastPollingTimeoutId) {
    clearTimeout(fastPollingTimeoutId)
    fastPollingTimeoutId = null
  }
}

/** refresh one dynamic section of the page. */
function refresh(sectionName) {
  // Get latest admin data
  // Active (force state update) polling only when unlocked, otherwise it's just viewing state data.
  activeParam = locked ? '' : '?active=true'
  return fetch('/admin/admin.json' + activeParam)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      // Skip page update if the etag has not changed since the last response (ie. must be cached)
      const etag = response.headers.get('etag')
      if (lastETag === null || etag !== lastETag) {
        lastETag = etag
        // transform to html and insert into page. Add the local 'locked' flag to admin state for use in
        // templated page rendering.
        var data = await response.json()
        data.locked = locked
        // Sort logs in reverse chrono order of message generation (Should be close to this order already but may have been disordered in the message batching process)
        if (data.logs) {
          data.logs = data.logs.sort((a, b) => b.time - a.time)
        }
        if (data.latest) {
          data.latest = data.latest.sort((a, b) => b.time - a.time)
        }
        var template = Handlebars.templates[sectionName]
        if ( ! (data.display.deploying || data.display.building || data.display.preparing)) {
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
  if (locked) {
    return  // don't send commands when locked (buttons should be disabled)
  }
  return fetch('/admin/command/' + name, {
    method: 'POST',
    cache: 'no-cache',
    headers: new Headers({
      'Authorization': 'BASIC ' + btoa('admin:' + sessionStorage.getItem('auth-secret')),
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify(params)
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    console.log(response.status + ': ' + JSON.stringify(response))
    startFastPolling()
  })
}
