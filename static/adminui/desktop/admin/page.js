let authSecret = null
let lastETag = null

onload = function() {
  // Event handlers
  document.getElementById('auth-save').onclick = function(ev) {
    authSecret = document.getElementById('auth-secret').value
  }
  //
  refresh('admin')
  // Attempt to refresh all page sections every second
  setInterval(function() {
    refresh('admin')
  }, 1000)
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
    }),
    body: JSON.stringify(body)
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    console.log(response.status + ': ' + JSON.stringify(response))
  })
}
