#!/bin/bash
wdir=$(pwd)

# package admin worker lambda
admin/npm run pack
mv admin/autosite-admin.zip target

# package provisioner plugin lambda
provisioner/npm run pack
mv provisioner/autosite-provisioner.zip target

# Package edge lambdas
cd edge
zip -r target/lambdas.zip *

# Compile UI templates into admin UI source
handlebars static/admin/templates/desktop/admin.handlebars -f static/adminui/desktop/admin.handlebars.js
handlebars static/admin/templates/mobile/admin.handlebars -f static/adminui/mobile/admin.handlebars.js

# Package admin UI files
cd static/adminui
zip -r target/adminui.zip *
cd $wdir
