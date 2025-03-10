# Author Site 0.9.2

If you're looking to build a static website with worldwide reach for very low hosting cost, 100% under your control, and with no significant limits on data size or bandwidth, you are welcome use this template with your own AWS account. This template is free for use disributed under the Open Source Apache License 2.0.

The primary goal of this project is to allow authors to create low-cost, low-maintenance author websites to showcase your work, and provide a basic point of contact with readers. Some technical experience is required in the intial setup, mainly in creating a domain in AWS, and editing/uploading configuration files for the site.

If you have more experience with website development, this template can also provide a base for you to customize with your own static HTML code or code generator.

## Overview

This template creates all the infrastructure necessary to host a mostly static website from an S3 bucket, with the following enhancements:

- HTTPS and custom domain support
- Cloaking of .html extensions on page urls.
- Email feedback form with truly hidden email address.
- Websites can be generated from eisting templates, or existing files uploaded to the site.
- An editor UI is provided, that works with built-in templates, or provide your own template files (advanced)
- Use the built-in site generator, or provide your own lambda function (advanced)
- Website files are first generated to a test site first, then promoted to the live site with one click.
- Creates a unique key pair for uploading files to only this website's test site bucket.
- Built-in forwarder to the Amazon store for the user's country for book links.
- Custom 404 (not found) page (returns to index.html).

## Beta Period

This software is still in 'beta' state. All functions are complete, but there are likely still some bugs lurking. Mostly these will be cosmetic issues, but serious issues, up to and including loss of any data entered into the site(s) is possible.

## Other Options

This static site service fills a simillar role as using AWS Amplify, but with less $/GB for data transfer. there's also less chance of obscelescence and maintenance due to shifting AWS priorities since it works directly with AWS core building blocks. If you are planning to use your own website/generator code (Not the default site templates provided), and are comfortable with git and build pipelines, then you may want to check out AWS Amplify instead of this service.

## Requirements

 - Sign up for an [Amazon Web Services Account](https://aws.amazon.com/free).

## Costs

Costs will vary depending on traffic volume, but for the relatively low traffic most author websites serve, monthly costs should be no more than a few cents (USD).

If you also host your domain with AWS each domain will cost $0.50 USD/month, but you can have effectively unlimited subdomains and run a different static site on each subdomain. Each site can have it's own style and data (ie. series1.authordomain.com, series2.authordomain.com)

If you see a huge amount of traffic, or are storing a large amoount of data in the site's S3 bucket, you may see some extra charges. It's always a good idea to keep an eye on your [current and projected billing](https://console.aws.amazon.com/billing/home).

## Demo Sites
All images and colours can be changed in the Site Admim UI.

#### Live Sites (We use this same software for all of our author sites)
- Publisher: https://www.braevitae.com/
- Author: https://rebeccabrae.braevitae.com/
- Author: https://adriaanbrae.braevitae.com/

#### Specially Constructed Demo Sites
- Author - 1 Book: https://demo1.braevitae.com/
- Author - 2 Books: https://demo2.braevitae.com/
- Author - 5 Books: https://demo5.braevitae.com/
- Author - 8 Books: https://demo8.braevitae.com/

## Building your site

There are three different options for building your site, depending on what you may already have set up, and what you want to create.

Log in to your AWS Console account, then click on the link that best suits your needs from the same browser:

1) I want to create a site with no personalized domain, for a trial run, or because I want to link it with a domain hosted in another service: [**Build site with no domain**](https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/create/review?templateURL=https://braevitae-pub.s3.amazonaws.com/AutoSite-0.9.2/AuthorSite.template). The site domain will be auto-generated, and can be found on the *Outputs* tab of the completed stack.

2) I want to create a site with a new domain that I will host in AWS: [**Build site with domain**](https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/create/review?templateURL=https://braevitae-pub.s3.amazonaws.com/AutoSite-0.9.2/AuthorSite-domain.template). AWS will charge $0.50 USD per month for each distinct domain hosted.

3) I want to create a site as a subdomain of a domain I already host in AWS: [**Build site with sub-domain**](https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/create/review?templateURL=https://braevitae-pub.s3.amazonaws.com/AutoSite-0.9.2/AuthorSite-subdomain.template)

This will open a page in the AWS Cloud Formation service showing the BraeVitae Static Website Template configuration. Fill in all required parameters and click *Create Stack*. The auto-generated base site URL can be found on the *Outputs* tab of the completed stack.

### Parameters

**Stack Name**: The primary identifier for this site's infrastructure in AWS. You must use a unique name. The name must NOT contain any uppercase characters (AWS will allow uppercase, but this stack build will fail because it uses this name as part of S3 bucket names, which do not allow uppercase characters) or the dash (-) character (Some internal processing still assumes a single dash in the name, for now).

**DomainName**: The URL for this site. It must be one of the existing hosted domains in your acount, or a subdomain of one of them. Only available for Domain and Sub-Domain sites (options #2 and #3, above).

**DomainZoneId**: Enter the Hosted Zone ID of the parent domain here. This value can be found in the Route53 service by clicking on the hosted zone and opening the Hosted Zone Details section. Only available for Sub-Domain sites (option #3, above).

**FeedbackEmail**: The email address where you would like to receive feedback emails from this site. When you build the stack this address will recieve a registration confirmation email that you will need to respond to in order for feedback emails to be sent.

**SharedStorage**: Select Yes if this is your first site for this AWS account. Even if you're not sure you'll ever have another site stack, there's no down-side to creating the shared S3 bucket.

**SharedStorageName**: If SharedStorage is 'No' above, here's where you can enter the name of a previously created stack's shared storage (See the 'Outputs' associted with that stack for the name).

**SiteGenerator**: This field determines the generator that will be used to create your website code. Only one generator is currenlly provided: 'braevitae-pub:AutoSite-0.9.2/lambdas/authorsite.zip', but you can also supply the bucket and path to your own generator function. (Use //Stackname-admin: or //Stack name-shared) as the bucket name, if you want to upload a generator to one of the site private buckets after creation).

If you want to upload your own raw content to the site (perhaps created with tools lke [HUGO](https://gohugo.io/) or [Jekyll](https://jekyllrb.com/)), just enter the default value above and directly upload your own content to the test bucket.

**UploaderPassword**: The initial password for the AdminUI. You can change this later.

## Administration UI

Once the AWS Cloud Formation stack has been sucessfully generated, enter the domain name you provided to the stack, and you will be redirected to the Site Admin UI. To log in, enter the password you provided to the stack.

You will then be prompted to select a default template. Currently there are two templates available:

- Author: A site for authors to showcase their books.
- Publisher: A site for publishers to showcase books from multiple authors.

The Site Admin UI allows you to edit all template properties, and upload images to appear on your site. Tooltips are available on most action buttons and property names to better explain their function.

Your best guide will likely be to generate a test site (Click the Generate button) to see the results of your changes as you go. Once you are happy with the test site, click on the 'Publish' button to update your main domain site.

![Diagram](vizualization/adminUi.png)

## Bug Reporting

If you encounter any issues working with the administration UI or a generated site, please click on the 'Capture Logs' button in the footer. This will capture all server-side logs for the site and make them available for download in a single file. Please include this file in any bug report.

## Template Features

### Email Feeback Form

A great feature for any website, but expecially an author, is to give people an easy way to reach you with comments that does not depend on any one social media acount or email address (and does not require you to publish those account detials on the public site!).

The template will ask you for an email address, and shortly after running the template, this address will receive an email from Amazon AWS asking to confirm your subscription with the Simple Notification Service (SNS). You will need to click on the confim link to activate feedback.

To take advantage of this feature, you will need to include a form on your website, and HTTP POST the data to /feedback/*  (Where * is a name that identifies this form wihin this website.)

### Localized Amazon Store Links

A challenge for book publishers and buyers wanting to send customers to Amazon stores, is that Amazon uses distinct sites for different countries and regions. It's agravating for customers to have to navigate out of the store you sent them to, and search again for your book in their country's storefront. To ensure they don't lose interest before buying, it's much better to send them to the correct store to begin with.

There are a few other services on the internet that do the same thing for free, but it's much better to have these links under your own control, and branded to your own domain name.

To take advantage of this feature, create a link on a page on your site to /azn/e/{ASIN code} for Kindle and /azn/p/{ISBN-10 code} for print books. Both these codes can be foind on the Amazon store pages for your books.

### Social Media integration

The site creates HTTP header definitions that social media sites like Facebook and twitter can read to pre-configue the book cover and blurb to show up in a post.

### HTTPS support, and masking of .html extensions

AWS provides some built-in features to serve files from S3 buckets to browsers, but this lacks the professional touch. Would you rather send your readers to http://my.domain.com/promotion.html or https://my.domain.com/promotion. A subtle difference, perhaps, but one that stands out. Especially on a poster or business card.

### Show home page instead of error for missing pages

One thing you hate your potential reader to see is an ugly error page instead of your site. It's easy for a mistake to creep into a URL link, or for a page to be moved. In these cases, we'll simply redirect the reader back to the main home page of your site (index.html) so the at least get close to the right place.

### Unique access key for uploading files

It is posisble to upload files directly wih the AWS S3 console to the bucket with the same name as your site's test domain, as described above, but for a large site, it's much, much easier to use a syncing tool like the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-services-s3-commands.html) or others. But to do this, you'll need to provide an access key pair for your site's S3 bucket. These keys are provided on the 'outputs' tab of this cloud Formation stack once it completes.


## Deleting The Site from your AWS Account

If you try out this template, then decide you don't want it any more, you can easily delete all the infrastructure created in your AWS account by deleting the Cloud Formation stack this template created.

Unfortunatey, The first attempt to delete the stack will likely fail, since AWS holds on to Lambda functions that have been part of a Lambda@Edge, even though the @Edge regisration has been deleted already. When this happens, simply wait about an hour and delete the stack again.

Occaisionally, even though the stack is designed to clear all S3 buckets os they can be deleted, somtimes one or two buckets retain some data. These leftover buckets will be listed when you try to delete the stack. Open each bucket and delete all files, then delete the stack again.

Leftover CloudWatch log groups can sometimes also cause a problem. The stack delete will succeed but the edge and provisoner groups will have some last-minute data written to them so they are re-created. This will cause a provsioning failure when you try to build another site with the same name. If this happens, search for the site name in CloudWatch log groups and delete any that show up.


### A Diagram of the AWS Resources Created for each Site

(Some resources exlcluded for clarity)

![Diagram](vizualization/AuthorSite.template.png)
