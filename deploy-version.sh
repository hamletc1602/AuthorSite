#!/bin/bash
version=$1

wdir=$(pwd)

# NOTE: It's expected that the version parameter _include_ the leading dash (-) for compatibility
#       with the current un-versioned dir. Once the main dir is a versioned one, this can be corrected.
echo Build customized CFN provisioning template versions and copy to target
cd build
npm run build -- $version
mv AuthorSite.template $wdir/target/AutoSite
mv AuthorSite-domain.template $wdir/target/AutoSite
mv AuthorSite-subdomain.template $wdir/target/AutoSite
cd $wdir

echo "Do you really want to re-deploy and overwrite version $version of the AutoSite install?"
select yn in "Yes" "No"; do
    case $yn in
        Yes ) echo Sync target dir with public bucket; aws s3 sync target/AutoSite s3://braevitae-pub/AutoSite$version/; break;;
        No ) exit;;
    esac
done
