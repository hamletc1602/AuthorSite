/**  */
export default class Util {

  static sanitizeS3FileName(name) {
    return name.replace(/[^a-zA-Z\d-!_'.*()]/g, '-')
  }

  // Generate a file path string from the given routing path and schema
  static createFilePath(path, schema, ext) {
    // The file name will be generated from the last path entry name, or the last index entry, if there is one or more.
    const reversePath = [...path].reverse()
    const filePath = []
    let fileName = null
    let foundIndex = false
    reversePath.forEach((entry, index) => {
      if (index === 0) {
        fileName = entry.name
      } else {
        if ( ! foundIndex && entry.index) {
          // re-add the last (first) elem to the end of the path, since we're using the index name as the file name now.
          filePath.push(fileName)
          fileName = entry.name
          foundIndex = true
        } else {
          filePath.unshift(entry.name)
        }
      }
    })
    // Ext. type should be set during initial editing, but need a default guess for some existing config files
    if ( ! ext) {
      switch (schema.type) {
        case 'image':
          ext = 'jpg'
          break
        case 'text':
          ext = 'md'
          break
        default:
          ext = 'txt'
      }
    }
    fileName += ('.' + ext)
    // Add the file name to the end of the path
    filePath.push(fileName)
    // Format the file path
    let filePathStr = ''
    filePath.forEach((item, index) => {
      if (index !== 0) {
        filePathStr += '/'
      }
      filePathStr += this.sanitizeS3FileName(item)
    })
    return filePathStr
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
    let config = configs.current[path[0].name]
    if ( ! config) {
      throw new Error(`Missing config for editor ${path[0]}`)
    }
    config = config.schema
    for (let i = 1; i < path.length; ++i) {
      const p = path[i]
      // Ignore index markers in the path, they are meaningless for schema
      if (p.index === undefined) {
        config = config.properties[p.name]
      }
    }
    if (config) {
      return config
    } else {
      console.error(`Current path ${JSON.stringify(path)} does not match schema config`, configs.current)
    }
  }

  // Get config content data for a given content path
  static getContentForPath(configs, path) {
    let config = configs.current[path[0].name]
    if ( ! config) {
      throw new Error(`Missing config for editor ${path[0]}`)
    }
    config = config.content
    for (let i = 1; i < path.length; ++i) {
      const p = path[i]
      if (p.index === undefined) {
        config = config[p.name]
      } else {
        config = config[p.index]
      }
    }
    if (config !== undefined) {
      return config
    } else {
      console.error(`Current path ${path} does not match content config`, configs.current)
    }
  }

  // Completely replace the content at the current path with this new content
  static setContentForPath(configs, path, content) {
    let config = configs.current[path[0].name]
    if ( ! config) {
      throw new Error(`Missing config for editor ${path[0]}`)
    }
    config = config.content
    for (let i = 1; i < (path.length - 1); ++i) {
      const p = path[i]
      if (p.index === undefined) {
        config = config[p.name]
      } else {
        config = config[p.index]
      }
    }
    if (config !== undefined) {
      config[path[path.length - 1].name] = content
    } else {
      console.error(`Current path ${path} does not match content config`, configs.current)
    }
  }

  // Create a new object of the type of the provided schema
  static createNewFromSchema(schema) {
    if (schema.type === 'object') {
      const obj = {}
      Object.keys(schema.properties).forEach(key => {
        const prop = schema.properties[key]
        obj[key] = Util.createNewFromSchema(prop)
      })
      return obj
    } else {
      return Util.getDefaultValue(schema.type, schema.properties)
    }
  }

  // Return a default (single) value for the given type.
  static getDefaultValue(type) {
    switch(type) {
      case 'text': return {}
      case 'image': return {}
      case 'string': return ''
      case 'number': return 0
      case 'url': return ''
      case 'color': return ''
      case 'list': return []
      case 'object': throw new Error(`Should never see type 'object' here.`)
      default: return null
    }
  }

}