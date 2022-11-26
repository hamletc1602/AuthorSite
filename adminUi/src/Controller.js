import StripJsonComments from 'strip-json-comments'

/**  */
export default class Controller {
  //
  static lockId = ''

  constructor() {
    this.lastETag = null
    this.locked = false
    this.password = null
    this.config = null
    this.editors = {}
  }

  static setLockId(lockId) {
    Controller.lockId = lockId
  }

  static sanitizeS3FileName(name) {
    return name.replace(/[^a-zA-Z\d-!_'.*()]/g, '-')
  }

  static getContentFilePath(editorId, item) {
    if (item.item && item.item.name) {
      // Property is part of a list. Use a sanitized version of the list item name as the file name
      const fileName = Controller.sanitizeS3FileName(item.item.name)
      //  Assuming all files are markdown for now - May provide a way for user to force text mode?
      return `${editorId}/${item.name}/${fileName}.md`
    } else {
      return `${editorId}/${item.name}.md`
    }
  }

  setPassword(password) {
    this.password = password
  }

  getConfig() {
    return this.config
  }

  /** Lock state polling */
  async getLockState() {
    return fetch(`/admin/lock?lockId=${Controller.lockId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        if (await response.text() === 'unlocked') {
          this.locked = false
        } else {
          this.locked = true
        }
      })
  }

  /** Check all the 'busy' states */
  isBusy() {
    return this.config.display.deploying || this.config.display.building || this.config.display.preparing
  }

  /** Check if the server admin state has been changed. If yes, store the new value and return true. */
  async checkState() {
    // Get latest admin data
    // Active (force state update) polling only when unlocked, otherwise it's just viewing state data.
    const activeParam = this.locked ? '' : '?active=true'
    return fetch('/admin/admin.json' + activeParam, {
      headers: {
        Accept: 'application/json'
      }
    })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      // Skip page update if the etag has not changed since the last response (ie. must be cached)
      const etag = response.headers.get('etag')
      if (this.lastETag === null || etag !== this.lastETag) {
        this.lastETag = etag
        this.config = await response.json()
        this.config.locked = this.locked
        return true
      }
      return false
    })
  }

  /** Create basic auth slug */
  basicAuth(user, password) {
    user = user || 'admin'
    password = password || this.password
    if (user !== null && password !== null) {
      return 'BASIC ' + btoa(user + ':' + password)
    }
    return null
  }

  /** Post a command to the admin API
    We generally don't expect any immediate feedback from commands, other than errors. Status is pushed
    into the server admin state JSON file.
  */
  sendCommand(name, params) {
    if (this.locked || !this.password) {
      // do not send commands when locked (buttons should be disabled) or when there's
      // no password defined.
      return
    }
    return fetch('/admin/command/' + name, {
      method: 'POST',
      cache: 'no-cache',
      headers: new Headers({
        'Authorization': this.basicAuth(),
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify(params)
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      console.log(response.status + ': ' + JSON.stringify(response))
    })
  }

  /** Return true if the given password is valid. */
  async validatePassword(password) {
    return fetch('/admin/command/validate', {
      method: 'POST',
      cache: 'no-cache',
      headers: new Headers({
        'Authorization': this.basicAuth(null, password),
        'Content-Type': 'application/json'
      })
    }).then((response) => {
      return response.ok
    })
  }

  /** Get various config files for the given template.
    configSection is optional. If undefined, metadata about all available config files will be returned.

    /admin/site-config : Root config describing what other config files are available, and some metadata for them
    /admin/site-config/{name} : The content of the config file (May not be JSON)
  */
  async getSiteConfig(templateId, configSection) {
    try {
      let url = `/admin/site-config/${templateId}`
      if (configSection) {
        url += '/' + configSection
      }
      return fetch(url, {
        headers: new Headers({
          'Authorization': this.basicAuth(),
        })
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const type = response.headers.get('Content-Type')
        let contentStr = await response.text()
        contentStr = StripJsonComments(contentStr)
        return {
          contentType: type,
          content: JSON.parse(contentStr)
        }
      })
    } catch (error) {
      console.error('Failed to get site config', error)
      return {
        contentType: null,
        content: null
      }
    }
  }

  /** Put various config files for the given template */
  async putSiteConfig(templateId, configSection, contentType, content) {
    return fetch(`/admin/site-config/${templateId}/${configSection}`, {
      method: 'POST',
      cache: 'no-cache',
      headers: new Headers({
        'Authorization': this.basicAuth(),
        'Content-Type': contentType
      }),
      body: Buffer.from(content)
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to put site content. Status: ${response.status}`);
      }
      return response.json()
    })
  }

  async getEditors(templateId) {
    let siteMetadata = this.editors[templateId]
    if ( ! siteMetadata) {
      const resp = await this.getSiteConfig(templateId)
      if (resp.content) {
        siteMetadata = resp.content
        this.editors[templateId] = siteMetadata
      }
    }
    return siteMetadata
  }

  getKeyFieldName(objSchema) {
    if (objSchema.properties) {
      const names = Object.keys(objSchema.properties)
      return names.find(name => {
        const field = objSchema.properties[name]
        return !!field.key
      })
    }
    return null
  }

  /** Get various site content files for the given template. */
  async getSiteContent(templateId, contentPath) {
    try {
      return fetch(`/admin/site-content/${templateId}/${contentPath}`, {
        headers: new Headers({
          'Authorization': this.basicAuth(),
        })
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const type = response.headers.get('Content-Type')
        let content = await response.arrayBuffer()
        return {
          contentType: type,
          content: content
        }
      })
    } catch (error) {
      console.error('Failed to get site content.', error)
      return {
        contentType: null,
        content: null
      }
    }
  }

  /** Put various site content files for the given template */
  async putSiteContent(templateId, contentPath, contentType, content) {
    return fetch(`/admin/site-content/${templateId}/${contentPath}`, {
      method: 'POST',
      cache: 'no-cache',
      headers: new Headers({
        'Authorization': this.basicAuth(),
        'Content-Type': contentType
      }),
      body: Buffer.from(content)
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to put site content. Status: ${response.status}`);
      }
      return response.json()
    })
  }

}