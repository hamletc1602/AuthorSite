/**  */
export default class Util {

  static sanitizeS3FileName(name) {
    return name.replace(/[^a-zA-Z\d-!_'.*()]/g, '-')
  }

  static getContentFilePath(editorId, item) {
    if (item.item && item.item.name) {
      // Property is part of a list. Use a sanitized version of the list item name as the file name
      const fileName = Util.sanitizeS3FileName(item.item.name)
      //  Assuming all files are markdown for now - May provide a way for user to force text mode?
      return `${editorId}/${item.name}/${fileName}.md`
    } else {
      return `${editorId}/${item.name}.md`
    }
  }

  static contentTypeFromSchemaType(schemaType) {
    switch (schemaType) {
      case 'text': return 'text/plain'
      case 'image': return null   // Image content type is determined by the type of image selected by the user for upload
      default:
        console.log(`Unknown schema type: ${schemaType}`)
    }
  }

  // Get config schema for a given content path
  static getSchemaForPath(configs, path) {
    let config = configs.current[path[0]]
    if ( ! config) {
      throw new Error(`Missing config for editor ${path[0]}`)
    }
    config = config.content.schema
    for (let i = 1; i < path.length; ++i) {
      const p = path[i]
      // Ignore index markers in the path, they are meaningless for schema
      if (p.name) {
        config = config[p.name]
      }
    }
    if (config) {
      return config
    } else {
      console.error(`Current path ${path} does not match schema config`, configs.current)
    }
  }

  // Get config content data for a given content path
  static getContentForPath(configs, path) {
    let config = configs.current[path[0]]
    if ( ! config) {
      throw new Error(`Missing config for editor ${path[0]}`)
    }
    config = config.content.content
    for (let i = 1; i < path.length; ++i) {
      const p = path[i]
      config = config[p.name || p.index]
    }
    if (config) {
      return config
    } else {
      console.error(`Current path ${path} does not match content config`, configs.current)
    }
  }

  // Update global configs
  static updateConfigs(configs, path, state) {
    // Get the config for the 2nd-last element in the path
    const config = Util.getContentForPath(configs, path.slice(0, -1))
    if (config) {
      // Update the value for the property named as the last element in the path
      config[path[path.length - 1]] = state
    } else {
      console.error(`Current path ${path} does not match config`, configs.current)
    }
  }

}