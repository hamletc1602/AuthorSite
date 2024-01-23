import StripComments from 'strip-comments'

/**  */
export default class Controller {
  //
  static BODY_UPLOAD_MAX_SIZE = 1024 * 39  // 1K under 40K CloudFront viewer request body size limit

  //
  static lockId = ''

  constructor() {
    console.log(`Creating new Controller`)
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
    if (this.password) {
      return fetch(`/admin/lock?lockId=${Controller.lockId}`, {
        headers: new Headers({
          'Authorization': this.basicAuth()
        })
      })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        if (await response.text() === 'unlocked') {
          this.locked = false
        } else {
          this.locked = true
        }
        return this.locked
      })
    }
    return false // assume not locked, if there's no auth yet.
  }

  isLocked() {
    return this.isLocked
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
      // TODO: Seems like AWS is always returning 304 now, as expected, when ETag matches?  Maybe this was a workaround
      // for a prior server-side bug?  Can likely remove this code and just check for 304 response?
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
  async sendCommand(name, params) {
    if (this.locked || !this.password) {
      // do not send commands when locked (buttons should be disabled) or when there's
      // no password defined.
      return
    }
    await fetch('/admin/command/' + name, {
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
      // Add a cache-buster timestamp parameter to the URL mainly to ignore cached '404' responses.
      return fetch(`/content/${templateId}/${contentPath}?t=${Date.now()}`, {
        headers: new Headers({
          'Authorization': this.basicAuth(),
        })
      }).then(async (response) => {
        if (!response.ok) {
            // Errors like 404 etc. should not throw an exception
            if (response.status >= 500 || response.status === 403) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          } else {
            return null
          }
        }
        const type = response.headers.get('Content-Type')
        // Content could be text, json or (default) binary
        let content = null
        if (type === 'application/json') {
          content = await response.json()
        } else if (type.indexOf('text/') === 0) {
          content = await response.text()
        } else {
          content = await response.arrayBuffer()
        }
        return {
          contentType: type,
          content: content
        }
      })
    } catch (error) {
      console.error('Failed to get site content.', error)
      return null
    }
  }

  /** Put various site config files for the given template. */
  async putSiteConfig(templateId, contentPath, contentType, content) {
    if (contentType === 'application/json' && ! content.substring) {
      // Looks like this is a config file object. Need to serialize it before we upload it.
      // Non-JSON config should always be a string.
      content = JSON.stringify(content)
    }
    return this.putSiteContentInner('site-config', templateId, contentPath, contentType, content)
  }

  /** Put various site content files for the given template. */
  async putSiteContent(templateId, contentPath, contentType, content) {
    if (content && (content.length > 0 || content.byteLength > 0)) {
      return this.putSiteContentInner('site-content', templateId, contentPath, contentType, content)
    }
  }

  /** Uplaod files to S3 via lambda@Edge Admin viewer func. */
  async putSiteContentInner(command, templateId, contentPath, contentType, content) {
    const contentLength = content.byteLength || content.length
    if (contentLength < Controller.BODY_UPLOAD_MAX_SIZE) {
      return this.putSiteContentPart(command, templateId, contentPath, contentType, 1, 1, content)
    } else {
      // Push file to the server in parts. The server will merge the parts.
      const partCount = Math.floor(contentLength / Controller.BODY_UPLOAD_MAX_SIZE) + 1
      for (let i = 0; i < partCount; ++i) {
        const partContent = content.slice(Controller.BODY_UPLOAD_MAX_SIZE * i, Controller.BODY_UPLOAD_MAX_SIZE * (i + 1))
        await this.putSiteContentPart(command, templateId, contentPath, contentType, i + 1, partCount, partContent)
      }
    }
  }

  /** Upload one part of content that may otherwise be too large for a 'viewer' lambda@Edge to handle. */
  async putSiteContentPart(command, templateId, contentPath, contentType, part, partCount, content) {
    return fetch(`/admin/${command}/${templateId}/${contentPath}?part=${part}&total=${partCount}`, {
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

  /** Delete site content */
  async deleteContent(templateId, contentPath) {
    return fetch(`/admin/site-content/${templateId}/${contentPath}`, {
      method: 'DELETE',
      headers: new Headers({
        'Authorization': this.basicAuth()
      })
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to delete site content. Status: ${response.status}`);
      }
      return response.text()
    })
  }

}