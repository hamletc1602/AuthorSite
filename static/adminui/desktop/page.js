/** refresh one dynamic section of the page. */
function refresh(sectionName) {
  // Get latest admin data
  const myRequest = new Request('/admin.json');
  fetch(myRequest)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      // Check for not modified response and skip page update
      if (response.status !== 304) {
        // transform to html and insert into page
        var template = Handlebars.templates[sectionName]
        document.getElementById(sectionName + 'Section').innerHTML = template(data)
      }
    })
}

// Attempt to refresh all page sections every second
setInterval(function() {
  refresh('admin')
}, 1000)
