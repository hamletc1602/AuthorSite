#!/bin/bash
wdir=$(pwd)

# Initial build machine setup:
# npm i handlebars -g

echo clean old target and temp files
rm -rf target/AutoSite/layers/*
rm -rf target/tmp
# Clean DS_Store files
find . -name '.DS_Store' -type f -delete

echo Build Admin worker node_modules layer
rm -f target/AutoSite/provision/admin-worker.layer.zip
cd admin
rm -rf node_modules
npm run install-for-aws >/dev/null
npm run pack >/dev/null
mkdir -p $wdir/target/tmp/app
mkdir -p $wdir/target/tmp/nodejs
unzip -q admin-worker.zip -d $wdir/target/tmp/app
rm -f admin-worker.zip
cd $wdir/target/tmp
mv app/node_modules nodejs
zip -qr $wdir/target/AutoSite/layers/admin-worker.layer.zip nodejs/*
cd $wdir
rm -rf target/tmp/*

echo Build AuthorSite generator node_modules layer
rm -f target/AutoSite/builders/authorsite.layer.zip
cd generators/authorsite
rm -rf node_modules
npm run install-for-aws >/dev/null
npm run clean-install-for-aws >/dev/null
npm run pack >/dev/null
mkdir -p $wdir/target/tmp/app
mkdir -p $wdir/target/tmp/nodejs
unzip -q authorsite.zip -d $wdir/target/tmp/app
rm -f authorsite.zip
cd $wdir/target/tmp
mv app/node_modules nodejs
# Hack for Node-Sass Linux-x64 lib
echo Insert node-saas binding into layer zip file
mkdir -p nodejs/node_modules/node-sass/vendor/linux-x64-93
cp $wdir/generators/lib/linux-x64-93_binding.node nodejs/node_modules/node-sass/vendor/linux-x64-93/binding.node
# Add Hugo static site generator (and supporting libs)
mkdir -p nodejs/hugo
unzip -q $wdir/generators/lib/lambda-layer-libstdc.zip -d nodejs/hugo
cp $wdir/generators/hugo/hugo-app-linux-x64/* -d nodejs/hugo
#
zip -qr $wdir/target/AutoSite/layers/authorsite.layer.zip nodejs/*
cd $wdir
rm -rf target/tmp/*

echo Build provisioner node_modules layer
rm -f target/AutoSite/provision/provisioner.layer.zip
cd provisioner
rm -rf node_modules
npm run install-for-aws >/dev/null
npm run pack >/dev/null
mkdir -p $wdir/target/tmp/app
mkdir -p $wdir/target/tmp/nodejs
unzip -q provisioner.zip -d $wdir/target/tmp/app
rm -f provisioner.zip
cd $wdir/target/tmp
mv app/node_modules nodejs
zip -qr $wdir/target/AutoSite/layers/provisioner.layer.zip nodejs/*
cd $wdir
rm -rf target/tmp/*
