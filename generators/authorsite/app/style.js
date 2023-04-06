const Sass = require('node-sass');
const Files = require('./files')
const Path = require('path');

exports.render = (templateType, scssFilename, data, config) => {
  return new Promise((resolve, reject) => {
    let parts = Path.parse(scssFilename)
    config.templateType = templateType
    Files.loadTemplate(parts.dir, 'default', parts.base).then(Tpl => {
      const scssCode = Tpl(data, config)
      // Debug
      //await Files.saveFile(`/tmp/${parts.base}-intermediate.scss`, scssCode)
      Sass.render({
        file: Path.join(parts.dir, 'default', parts.base),  // Used only to determine default import path.
        data: scssCode,
        sourceComments: true
      }, function(err, result) {
        if (err) {
            reject(err)
        } else {
          try {
              resolve(result)
          } catch (err) {
              reject(err)
          }
        }
      });
    })
  });
}
