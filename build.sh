#!/bin/bash
wdir=$(pwd)

# Initial build machine setup:
# npm i handlebars -g

echo clean old target and temp files
rm -rf target/tmp
mkdir -p target/tmp
rm -rf target/AutoSite/provision/*
rm -rf target/AutoSite/builders/*
rm -rf generators/authorsite/tmp/*

echo package admin worker lambda
cd admin
npm i --platform=linux --arch=x64 >/dev/null
npm run pack >/dev/null
cd $wdir

echo Build Admin Worker node_modules layer
mkdir -p target/tmp/admin/app
mkdir -p target/tmp/admin/layer/nodejs
unzip -q admin/autosite-admin.zip -d target/tmp/admin/app
cd target/tmp/admin
mv app/node_modules layer/nodejs/node_modules
cd layer
zip -qr $wdir/target/AutoSite/provision/admin_node_modules.layer.zip nodejs/*
cd ../app
rm -f $wdir/target/AutoSite/provision/autosite-admin.zip
zip -qr $wdir/target/AutoSite/provision/autosite-admin.zip *
cd $wdir

echo package provisioner plugin lambda
cd provisioner
npm i --platform=linux --arch=x64 >/dev/null
npm run pack >/dev/null
cd $wdir

echo Package edge lambdas
cd edge
zip -qr $wdir/target/AutoSite/provision/lambda.zip *
cd $wdir

echo package site generator lambda
cd generators/authorsite
npm i --platform=linux --arch=x64 >/dev/null
npm run pack >/dev/null
echo Insert node-saas binding into zip file
mkdir -p tmp/node_modules/node-sass/vendor/linux-x64-93
cp ../lib/linux-x64-93_binding.node tmp/node_modules/node-sass/vendor/linux-x64-93/binding.node
cd tmp
zip -r ../authorsite.zip node_modules/*
cd ..
cd $wdir

echo Build AuthorSite generator node_modules layer
mkdir -p target/tmp/authorsite/app
mkdir -p target/tmp/authorsite/layer/nodejs
unzip -q generators/authorsite/authorsite.zip -d target/tmp/authorsite/app
cd target/tmp/authorsite
mv app/node_modules layer/nodejs/node_modules
cd layer
zip -qr $wdir/target/AutoSite/builders/authorsite.node_modules.layer.zip nodejs/*
cd ../app
rm -f $wdir/target/AutoSite/builders/authorsite.zip
zip -qr $wdir/target/AutoSite/builders/authorsite.zip *
cd $wdir

echo Compile UI templates into admin UI source
handlebars static/admin/templates/desktop/admin.handlebars -f static/adminui/desktop/admin/admin.handlebars.js
#handlebars static/admin/templates/mobile/admin.handlebars -f static/adminui/mobile/admin/admin.handlebars.js

echo Package admin UI files
cd static/adminui
zip -qr $wdir/target/AutoSite/provision/adminui.zip *
cd $wdir

echo Copy CFN provisioning template
cp AuthorSite.template target/AutoSite

echo End Cleanup
rm -rf target/tmp
