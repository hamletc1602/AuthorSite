import StripComments from 'strip-comments'

/**  */
export default class Controller {
  //
  static BODY_UPLOAD_MAX_SIZE = 1024 * 39  // 1K under 40K CloudFront viewer request body size limit

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
        contentStr = StripComments(contentStr)
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
        let content = await response.text()
        // AWS Lambda handlers cannot directly return binary data, so all content types other than
        // 'application/json' and 'text/plain' will be base64 encoded, and need to be decoded here,
        // and will be returned as a buffer.
        if ( ! (type === 'text/plain' || type === 'application/json')) {
          content = Buffer.from(content, 'base64')
        }
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

  /** Put various site content files for the given template. */
  async putSiteContent(templateId, contentPath, contentType, content) {
    if (contentType === 'application/json' && ( ! content.substring)) {
      // Looks like this is a config file object. Need to serialize it before we upload it.
      content = JSON.stringify(content)
    }
    const contentLength = content.byteLength || content.length
    if (contentLength < Controller.BODY_UPLOAD_MAX_SIZE) {
      return this.putSiteContentPart(templateId, contentPath, contentType, 1, 1, content)
    } else {
      // Push file to the server in parts. The server will merge the parts.
      const partCount = Math.floor(contentLength / Controller.BODY_UPLOAD_MAX_SIZE) + 1
      for (let i = 0; i < partCount; ++i) {
        const partContent = content.slice(Controller.BODY_UPLOAD_MAX_SIZE * i, Controller.BODY_UPLOAD_MAX_SIZE * (i + 1))
        await this.putSiteContentPart(templateId, contentPath, contentType, i + 1, partCount, partContent)
      }
    }
  }

  /** Upload one part of content that may otherwise be too large for a 'viewer' lambda@Edge to handle. */
  async putSiteContentPart(templateId, contentPath, contentType, part, partCount, content) {
    return fetch(`/admin/site-content/${templateId}/${contentPath}?part=${part}&total=${partCount}`, {
      method: 'POST',
      cache: 'no-cache',
      headers: new Headers({
        'Authorization': this.basicAuth(),
        'Content-Type': contentType
      }),
      body: content
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to put site content. Status: ${response.status}`);
      }
      return response.text()
    })
  }

  static arrayBufferToBase64(buffer) {
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return btoa( binary );
  }

}