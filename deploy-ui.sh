#!/bin/bash

# Initial build machine setup:
# npm i handlebars -g

echo Compile UI templates into admin UI source
handlebars static/admin/templates/desktop/admin.handlebars -f static/adminui/desktop/admin/admin.handlebars-1.0.0.js
#handlebars static/admin/templates/mobile/admin.handlebars -f static/adminui/mobile/admin/admin.handlebars-1.0.0.js

echo Sync admin ui with admin ui bucket
aws s3 sync static/adminui s3://demo-braevitae-com-admin-ui/ --cache-control max-age=86400,s-maxage=0
