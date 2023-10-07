#!/bin/bash
set version=$1

echo Build customized CFN provisioning template versions and copy to target
cd build
npm run build $version
mv AuthorSite.template $wdir/target/AutoSite
mv AuthorSite-domain.template $wdir/target/AutoSite
mv AuthorSite-subdomain.template $wdir/target/AutoSite
cd $wdir

echo Sync target dir with public bucket
aws s3 sync target/AutoSite s3://braevitae-pub/AutoSite/
