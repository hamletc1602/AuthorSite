import { v1 } from 'uuid'

/**  */
export default class Util {

  // Get inital list index from the index elem at the end of the path, or -1 if there's no index elem.
  static getCurrIndex(path) {
    if (path.length > 0) {
      const last = path[path.length - 1]
      if (last.index !== undefined) {
        return last.index
      }
      return -1
    }
    return null
  }

  // Get the root path less any initial index (if there's an index at the end of the path)
  static getRootPath(path) {
    if (path.length > 0) {
      const last = path[path.length - 1]
      if (last.index !== undefined) {
        return path.slice(0, -1)
      }
      return [...path]
    }
    return []
  }

  static sanitizeS3FileName(name) {
    return name.replace(/[^a-zA-Z\d-!_'.*()]/g, '-')
  }

  // Generate a file path string from the given routing path and schema
  static createFilePath(path, extwithDot) {
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
    if (extwithDot) {
      fileName += extwithDot
    }
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
  static createNew(rootPath, schema) {
    if (schema.type === 'object') {
      const obj = {}
      Object.keys(schema.properties).forEach(key => {
        const prop = schema.properties[key]
        const path = [...rootPath]
        path.push({ name: key })
        obj[key] = Util.createNew(path, prop)
      })
      return obj
    } else if (schema.type === 'text') {
      // HACK: The 'ensurePath' algorithm will try to create a directory for the last path element unless it contains a '.', which then breaks when it tries to write the file, so we make sure to add a spurious extension here.
      return Util.createFilePath(rootPath) + '/' + v1() + '.text'
    } else if (schema.type === 'image') {
      // HACK: The 'ensurePath' algorithm will try to create a directory for the last path element unless it contains a '.', which then breaks when it tries to write the file, so we make sure to add a spurious extension here.
      return Util.createFilePath(rootPath) + '/' + v1() + '.image'
    } else {
      return Util.getDefaultValue(schema)
    }
  }

  // Return a default (single) value for the given type.
  static getDefaultValue(schema) {
    switch(schema.type) {
      case 'string': return ''
      case 'number': return 0
      case 'url': return ''
      case 'color': return ''
      case 'list':
        if (schema.closed) {
          return schema.values[0]
        } else {
          return []
        }
      case 'object': throw new Error(`Should never see type 'object' here.`)
      default: return null
    }
  }

  // Fold index elements into a prefix for the following name entry so we can treat
  // paths with index elements the same as ones without.
  static condensePath(path) {
    const newPath = []
    let prevIndexElem = null
    path.forEach((elem, index) => {
      if (elem.index !== undefined) {
        prevIndexElem = elem
      } else {
        if (prevIndexElem) {
          newPath.push({
            indexName: prevIndexElem.name,
            name: elem.name,
            origIndex: index
          })
        } else {
          newPath.push({
            name: elem.name,
            origIndex: index
          })
        }
        prevIndexElem = null
      }
    })
    return newPath
  }

  /** Find any dynamic properties in the schema of the current config and refresh their cached list of generated
      property names based on the data in other refrenced schemas.
  */
  static async processDynamicProperties(configs, currConfig, loadConfig) {
    const currSchema = currConfig.schema
    if (currSchema.dynamicProperties) {
      currSchema.dynamicProperties.cache = {}
      await Promise.all(Object.entries(currSchema.dynamicProperties).map(async ([propName, propConf]) => {
        if ( ! propConf.source) {
          console.log(`Dynamic property ${propName} missing source attribute.`)
          return
        }
        const [sourceConfigId, sourcePropName] = propConf.source.split('/')
        let sourceConfig = configs[sourceConfigId]
        if ( ! sourceConfig) {
          sourceConfig = await loadConfig(sourceConfigId)
        }
        if (sourceConfig.schema.type !== 'list') {
          console.log(`Dynamic property ${propName} source is ${sourceConfig.type} type, not a list as required.`)
        }
        sourceConfig.content.forEach(p => {
          // Generator will not alert in log for property names with underscore that don't have a schema attached.
          currSchema.dynamicProperties.cache['_' + propName + '_' + p[sourcePropName]] = {
            type: propConf.type,
            disp: p[sourcePropName],
            desc: propConf.desc
          }
        })
      }))
    }
  }

}
