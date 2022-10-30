#!/bin/bash
# Create soft links to awsUtilsjs file in admin-worker project
cd edge
ln -s ../admin/awsUtils.js awsUtils2.js
cd ../generators/authorsite
ln -s ../../../admin/awsUtils.js awsUtils2.js
