#!/bin/bash
wdir=$(pwd)

# package admin worker lambda
cd admin
npm i >/dev/null
npm run pack >/dev/null
mv autosite-admin.zip $wdir/target/AutoSite/provision
cd $wdir

# package provisioner plugin lambda
cd provisioner
npm i >/dev/null
npm run pack >/dev/null
mv autosite-provisioner.zip $wdir/target/AutoSite/provision
cd $wdir

# Package edge lambdas
cd edge
zip -qr $wdir/target/AutoSite/provision/lambdas.zip *
cd $wdir

# package site generator lambda
cd generators/authorsite
npm i >/dev/null
npm run pack >/dev/null
mv authorsite.zip $wdir/target/AutoSite/builders
cd $wdir

# Compile UI templates into admin UI source
handlebars static/admin/templates/desktop/admin.handlebars -f static/adminui/desktop/admin.handlebars.js
#handlebars static/admin/templates/mobile/admin.handlebars -f static/adminui/mobile/admin.handlebars.js

# Package admin UI files
cd static/adminui
zip -qr $wdir/target/AutoSite/provision/adminui.zip *
cd $wdir

# Copy CFN provisioning template
cp AuthorSite.template target/AutoSite
