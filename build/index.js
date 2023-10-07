const Handlebars = require('handlebars')
const Fs = require('fs-extra')
const Path = require('path')

async function main() {
  const args = process.argv.slice(2);
  const templateFilePath = args[0]
  const sourceBucket = args[1]
  const version = args[2] || ''  // Default version to empty string

  const templateSource = await Fs.readFile(templateFilePath)
  const template = Handlebars.compile(templateSource.toString());

  const bareFileName = Path.basename(templateFilePath).split('.')[0]

  console.log(`Processng template: ${bareFileName}. Arguments: ${JSON.stringify(args)}`)

  const baseSiteTemplate = template({
    domain: false,
    subDomain: false,
    sourceBucket: sourceBucket,
    version: version
  })
  await Fs.writeFile(bareFileName + '.template', baseSiteTemplate)
  console.log(`Created core site template.`)

  const domainTemplate = template({
    domain: true,
    subDomain: false,
    sourceBucket: sourceBucket,
    version: version
  })
  await Fs.writeFile(bareFileName + '-domain.template', domainTemplate)
  console.log(`Created domain site template.`)

  const subDomainTemplate = template({
    domain: true,
    subDomain: true,
    sourceBucket: sourceBucket,
    version: version
  })
  await Fs.writeFile(bareFileName + '-subdomain.template', subDomainTemplate)
  console.log(`Created subdomain site template.`)
}

main()
  .then(
    ret => {
      console.log('Success: ' + ret)
    },
    err => {
      const errText = JSON.stringify(err)
      const errTrunc = errText.length > 200 ? errText.substring(0, 200) : err
      console.error('Error: ' + errTrunc)
    }
  )
