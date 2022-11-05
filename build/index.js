const Handlebars = require('handlebars')
const Fs = require('fs-extra')
const Path = require('path')

async function main() {
  const args = process.argv.slice(2);
  const templateFilePath = args[0]

  const templateSource = await Fs.readFile(templateFilePath)
  const template = Handlebars.compile(templateSource);

  const bareFileName = Path.basename(templateFilePath, Path.extname(templateFilePath))
  console.log(`Processng template: ${bareFileName}.`)

  const baseSiteTemplate = template({
    domain: false,
    subDomain: false
  })
  await Fs.writeFile(bareFileName + '.template', baseSiteTemplate)
  console.log(`Created core site template.`)

  const domainTemplate = template({
    domain: true,
    subDomain: false
  })
  await Fs.writeFile(bareFileName + '-domain.template', domainTemplate)
  console.log(`Created domain site template.`)

  const subDomainTemplate = template({
    domain: false,
    subDomain: true
  })
  await Fs.writeFile(bareFileName + '-subdomain.template', subDomainTemplate)
  console.log(`Created subdomain site template.`)
}
