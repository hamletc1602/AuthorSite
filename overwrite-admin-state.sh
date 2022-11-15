#!/bin/bash
SITE=$1

#echo Push modified admin state to admin bucket
#aws s3 cp './testing/admin.json' s3://braevitae-$SITE-admin-ui/admin/admin.json --cache-control 'no-cache,s-maxage=0' --content-type 'application/json'

#echo Push editors config files to default templates
aws s3 cp 'site-config/author/editors.json' s3://braevitae-$SITE-admin/site-config/author/editors.json --cache-control 'max-age=86400,s-maxage=0' --content-type 'application/json'
aws s3 cp 'site-config/artist/editors.json' s3://braevitae-$SITE-admin/site-config/artist/editors.json --cache-control 'max-age=86400,s-maxage=0' --content-type 'application/json'
