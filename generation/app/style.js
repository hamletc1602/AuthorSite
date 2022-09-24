const Sass = require('node-sass');
const Files = require('./files')
const Path = require('path');

exports.render = (templateType, scss_filename, data, config) => {
    return new Promise( async (resolve, reject) => {
        let parts = Path.parse(scss_filename)
        const Tpl = await Files.loadTemplate(parts.dir, templateType, parts.base)
        Sass.render({
            file: Path.join(parts.dir, templateType, parts.base),  // Used only to determine default import path.
            data: Tpl(data, config),
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
    });
}



