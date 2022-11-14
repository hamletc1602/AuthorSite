#!/bin/bash
SITE=$1

echo Compile UI source into runtime deploy
cd adminUi
npm run build

echo Sync admin ui with admin ui bucket: braevitae-$SITE-admin-ui
aws s3 sync build s3://braevitae-$SITE-admin-ui/desktop/admin --cache-control max-age=86400,s-maxage=0
