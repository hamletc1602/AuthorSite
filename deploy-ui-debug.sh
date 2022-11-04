#!/bin/bash

./build-template.sh

echo Sync admin ui with admin ui bucket
aws s3 sync static/adminui s3://demo-braevitae-com-admin-ui/ --cache-control max-age=86400,s-maxage=0
