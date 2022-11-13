/**  */
export default class Controller {
  //
  static lockId = ''

  constructor(siteHost) {
    this.siteHost = siteHost ? '//' + siteHost : ''
    this.lastETag = null
    this.locked = true
    this.fastPollingTimeoutId = null
    this.password = null
    this.config = null
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
    return fetch(`${this.siteHost}/admin/lock?lockId=${Controller.lockId}`)
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
    return fetch(this.siteHost + '/admin/admin.json' + activeParam)
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
        'Authorization': 'BASIC ' + btoa('admin:' + this.password),
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify(params)
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      console.log(response.status + ': ' + JSON.stringify(response))
      this.startFastPolling()
    })
  }

}