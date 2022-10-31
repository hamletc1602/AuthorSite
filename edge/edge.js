"use strict";

//
exports.onCache = async (event, _context) => {
  const cf = event.Records[0].cf;
  const request = cf.request;
  let suffix = '.html';
  // If the path already contains a '.', use default behaviour.'
  if (request.uri === '/' || request.uri.indexOf('.') !== -1) {
      suffix = '';
  }
  let typeDir = '';
  // If path ends in .json (data file) skip mobile/desktop switch
  if (request.uri.indexOf('.json') !== request.uri.length - 5) {
    typeDir = '/desktop';
    if (request.headers) {
      console.log(`Context: ${JSON.stringify(request.headers)}`)
        const mobileHeader = request.headers['cloudfront-is-mobile-viewer'];
        if (mobileHeader && mobileHeader[0] && mobileHeader[0].value) {
            if (mobileHeader[0].value === 'true') {
              typeDir = '/mobile';
            }
        }
    }
  }
  request.uri = typeDir + request.uri + suffix;
  return request;
};

//
exports.onAzn = async (event, _context) => {
  // Redirect to the correct amazon host for the country, with the same URL path that we're called with.
  const request = event.Records[0].cf.request
  if (request.headers) {
    console.log(`Context: ${JSON.stringify(request.headers)}`)
      const countryHeader = request.headers['cloudfront-viewer-country'];
      if (countryHeader) {
        if (countryHeader && countryHeader[0] && countryHeader[0].value) {
      const asin = getAsin(request.uri);
      if (asin.error) {
        console.log(asin.error);
        return request;
      }
            const isPrint = asin.code === 'p';
      return {
            status: '301',
            statusDescription: 'Moved Permanently',
            headers: {
                'location': [{ value: 'https://' + getAmazonHost(countryHeader[0].value, isPrint) + '/dp/' + asin.asin }],
                'cache-control': [{ value: "no-cache, no-store, private" }]
            }
      }
        }
      }
  }
  return request;
};

// Map GeoIP Country code to Amazon URL top level domain.
const countryUrlMap = {
  "GB": ".co.uk" ,
  "DE": ".de" ,
  "FR": ".fr" ,
  "ES": ".es" ,
  "IT": ".it",
  "NL": ".nl",
  "JP": ".co.jp",
  "IN": ".in",
  "CA": ".ca",
  "BR": ".com.br",
  "MX": ".com.mx",
  "AU": ".com.au",
  "CN": ".cn"
}

// Map GeoIP Country code to Amazon URL top level domain for POD book URLs.
const countryUrlMapPod = {
  "GB": ".co.uk",
  "DE": ".de",
  "FR": ".fr",
  "ES": ".es",
  "IT": ".it",
  "NL": ".de",
  "JP": ".com",
  "IN": ".com",
  "CA": ".com",
  "BR": ".com",
  "MX": ".com",
  "AU": ".com",
  "CN": ".com"
}

//
function getAmazonHost(countryCode, print) {
    let topDomain
  if (print) {
    topDomain = countryUrlMapPod[countryCode]
  } else {
    topDomain = countryUrlMap[countryCode]
  }
  if (topDomain) {
      return 'www.amazon' + topDomain
  } else {
      return 'www.amazon.com'
  }
}

function getAsin(uri) {
  let asin = '';
  let code = 'e';
  let parts = uri.split('/');
  if (parts.length > 3) {
    code = parts[2];
    asin = parts[3];
  } else if (parts.length > 2) {
    asin = parts[2];
  } else {
    return {
      code: 'INVALID_PATH',
      error: `'${uri}' is not a valid AZN shortcut path.`
    }
  }
  parts = asin.split('.');
  asin = parts[0]
  return {
    asin: asin,
    code: code
  }
}
