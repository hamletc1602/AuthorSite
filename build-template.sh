#!/bin/bash
wdir=$(pwd)

# Initial build machine setup:
# npm i handlebars -g

echo Build customized CFN provisioning template versions and copy to target
cd build
npm run build-dev
mv AuthorSite.template $wdir/target/AutoSite
mv AuthorSite-domain.template $wdir/target/AutoSite
mv AuthorSite-subdomain.template $wdir/target/AutoSite
cd $wdir
