#!/bin/bash
wdir=$(pwd)

# Initial build machine setup:
# npm i handlebars -g

echo Compile UI templates into admin UI source
handlebars static/admin/templates/desktop/admin.handlebars -f static/adminui/desktop/admin/admin.handlebars-1.0.0.js
#handlebars static/admin/templates/mobile/admin.handlebars -f static/adminui/mobile/admin/admin.handlebars-1.0.0.js
