# Install:
# npm i -g @mhlabs/cfn-diagram

cfn-dia draw.io -c -t target/AutoSite/AuthorSite-domain.template -o vizualization/AuthorSite.template.drawio \
--exclude-types 'AWS::CloudFront::CloudFrontOriginAccessIdentity' 'AWS::Lambda::Version' 'Custom::LambdaTrigger'

# Exclude of CloudFrontOriginAccessIdentity does not appear to be working.
# Possible workaround, but exclude by name not working?
#--exclude-names 'WebDataAccessPolicy' 'AdminUiDataAccessPolicy'

# Also, turn off edge labels does not appear to be working in -ci mode.