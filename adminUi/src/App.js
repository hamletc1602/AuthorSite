import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  ChakraProvider, extendTheme, Text, Link, Flex, Spacer, Grid,GridItem, Tabs, TabList, TabPanels,
  Tab, TabPanel, Skeleton, Modal, ModalOverlay, Popover, PopoverArrow, PopoverBody, Image,
  PopoverTrigger, PopoverContent, Portal, Button, Input, HStack, VStack, Select, Tooltip
} from '@chakra-ui/react'
import { ExternalLinkIcon, InfoOutlineIcon, RepeatIcon, CheckIcon, CloseIcon } from '@chakra-ui/icons'
import { mode } from '@chakra-ui/theme-tools'
import Controller from './Controller'
import PollAdminState from './PollAdminState'
import Editor from './Editor'
import Login from './Login'
import ChangingDomain from './ChangingDomain'
import SelectTemplate from './SelectTemplate'
import PreparingTemplate from './PreparingTemplate'
import deepEqual from 'deep-equal'
import Util from './Util'
import ActionButton from './ActionButton'
import PollLockState from './PollLockState'
import PollPutContent from './PollPutContent'
import PollAvailableDomains from './PollAvailableDomains'
import PollCfState from './PollCfState'
import ManageTemplatesPopup from './ManageTemplatesPopup'

// Theme
const props = { colorMode: 'light' } // Hack so 'mode' func will work. Need to actually get props with color mode from the framework, but defining colors as a func does not work??
const customTheme = extendTheme({
  initialColorMode: props.colorMode,
  useSystemColorMode: true,
  styles: {
    global: () => ({
      body: {
        bg: 'accent'
      }
    }),
  },
  semanticTokens: {
    colors: {
      base: mode('gray.300', 'gray.700')(props),
      baseText: mode('black', 'white')(props),
      disabledBaseText: mode('gray.600', 'gray.800')(props),
      accent: mode('blue.500', 'blue.500')(props),
      accentLighter: mode('blue.400', 'blue.400')(props),
      accentText: mode('white', 'white')(props),
      accentActiveText: mode('orange', 'orange')(props),
      editor: mode('white', 'black')(props),
      editorText: mode('black', 'white')(props),
      editorBg: mode('white', 'black')(props),
      editorDivider: mode('gray.300','gray.600')(props),
      listSelected: mode('gray.200', 'gray.200')(props),
      listNew: mode('blue.100', 'blue.100')(props),
      danger: mode('red', 'red')(props)
    }
  },
  components: {
    Tabs: {
      variants: {
        'line': {
          tab: {
            color: "accentText",
            _selected: {
              borderColor: 'accentActiveText',
              color: "accentActiveText",
            }
          }
        }
      }
    }
  }
})

// Known Server States (If true, check for end fast polling. false here implies server state may not be reliably cleaned up.)
const serverStates = {
  preparing: true,
  deploying: true,
  building: true,
  buildingStart: false,
  updatingTemplate: true,
  updatingUi: true,
  getLogs: true,
  saveTpl: true,
  renTpl: true,
  delTpl: true,
  settingPassword: true,
  setDomain: true
}

//
const controller = new Controller()

// Text
const BUTTON_GENERATE_TOOLTIP = 'Generate a test site from your configuration.'
const BUTTON_GENERATE_DEBUG_TOOLTIP = 'Generate a test site from your configuration with site debug mode enabled (This is an advanced feaure mainly used for debugging the generator template code)'
const BUTTON_PUBLISH_TOOLTIP = 'Replace your current live site content with the test site content.'
const BUTTON_UPDATE_TEMPLATE_TOOLTIP = 'Update to the latest template without impacting your site configuration.'
const BUTTON_UPDATE_UI_TOOLTIP = 'Update to the latest Admin UI version. The current version will be backed up at /restore/index'
const LIST_DOMAIN_TOOLTIP = 'Set this site\'s custom domain to one of the available, unused domains.'
const LIST_DOMAIN_TOOLTIP_UPDATING = 'AWS is currently updating this site\'s domain routing.'
const BUTTON_LOAD_TEMPLATE = 'DANGER! Load a new template, completely replacing all existing configuraton settings. This is an advanced feature for template debugging, only use this if you are cetain it is needed'
const BUTTON_MANAGE_TEMPLATES = 'Save all current configuraton settings to a new bundle, edit, or delete existing saved settings.'
const BUTTON_SET_PASSWORD = 'Change the site admin password'
const BUTTON_CAPTURE_LOGS = 'Capture the last 1 hour of logs to a text file.'
const BUTTON_DOWNLOAD_LOGS_1 = 'Captured log files available for download.'
const BUTTON_DOWNLOAD_LOGS_2 = 'Log files will be removed 1 hour after capture.'
const REFRESH_DOMAIN_TOOLTIP = 'Refresh the browser page to match the current active domain: '

const ADMIN_STATE_POLL_INTERVAL_FAST = 2 * 1000;
const ADMIN_STATE_POLL_INTERVAL_DEFAULT = 15 * 1000;
const FastPollingTimeoutMs = 5 * 60 * 1000
const BuildingTimeoutMs = 15 * 60 * 1000

let fastPollingTimeoutId = null
let passwordChangingDebounce = null

//
function App() {
  // State
  const [templateId, setTemplateId] = useState(null)
  const [adminStatePollIntervalMs, setAdminStatePollIntervalMs] = useState(ADMIN_STATE_POLL_INTERVAL_DEFAULT)
  const [displayStateChanged, setDisplayStateChanged] = useState(1)
  const [adminConfigChanged, setAdminConfigChanged] = useState(1)
  const [windowReload, setWindowReload] = useState(null)
  const [showLogin, setShowLogin] = useState(true)
  const [showChangingDomain, setShowChangingDomain] = useState(false)
  const [showSelectTemplate, setShowSelectTemplate] = useState(false)
  const [showPreparingTemplate, setShowPreparingTemplate] = useState(false)
  const [advancedMode, setAdvancedMode] = useState(false)
  const [authState, setAuthState] = useState('unknown')
  const [authErrorMsg, setAuthErrorMsg] = useState('')
  const [locked, setLocked] = useState(false)
  const [editorsEnabled, setEditorsEnabled] = useState(false)
  const [path, setPath] = useState([])
  const [uploadError, setUploadError] = useState(null)
  const [capturedLogs, setCapturedLogs] = useState([])
  const [availableDomains, setAvailableDomains] = useState([])
  const [capturingLogs, setCapturingLogs] = useState(false)
  const [putContentComplete, setPutContentComplete] = useState({})
  const [contentUpdate, setContentUpdate] = useState(null)
  const [editingSiteName, setEditingSiteName] = useState(false)

  // Calculated State
  const authenticated = useMemo(() => authState === 'success', [authState])

  // Global Refs
  const adminConfig = useRef({ new: true })
  const templates = useRef([])
  const editors = useRef([])
  const configs = useRef({})
  const adminDisplay = useRef({})
  const adminDomains = useRef({})
  const availableDomainsCache = useRef(null)
  const capturedLogsCache = useRef([])
  const prevEditorIndex = useRef(null)
  const contentToPut = useRef({})
  const fileContent = useRef({})
  const newPassword = useRef({})
  const manageTplFocus = useRef({})
  const siteNameInput = useRef({})

  const setDisplay = useCallback((prop, value) => {
    if (serverStates[prop] === undefined) {
      console.log(`Using unsupported display state: ${prop}`)
    }
    adminDisplay.current[prop] = value
    setDisplayStateChanged(Date.now())
  }, [])

  // Invoke when admin state polling determines something in the state has changed (new state from server)
  const setAdminState = useCallback((adminState) => {
    // Replace domains on each poll
    adminDomains.current = adminState.domains
    // Admin Config changed
    if ( ! deepEqual(adminConfig.current, adminState.config)) {
      if (adminConfig.current.templateId !== adminState.config.templateId) {
        setTemplateId(adminState.config.templateId)
      }
      adminConfig.current = adminState.config
      setAdminConfigChanged(Date.now())
    }
    // Display State changed
    if ( ! deepEqual(adminState.display, adminDisplay.current)) {
      console.log('Update display state: ' + adminState.display.stepMsg, adminState.display)
      if (adminDisplay.current) {
        // When cfDistUpdating changes from true to false (CF done updating), get domains list again to ensure
        // domain selection list shows the correct values.
        if (adminDisplay.current.cfDistUpdating === false && adminState.display.cfDistUpdating !== adminDisplay.current.cfDistUpdating) {
          controller.sendCommand('getAvailableDomains')
        }
      }
      if (adminState.display.building && adminState.display.buildingStart) {
        // Site generators can't be 100% trusted. Cancel 'building' state if it looks like it's gone on too long.
        try {
          const sinceBuildStartMs = Date.now() - Number(adminState.display.buildingStart)
          if (sinceBuildStartMs > BuildingTimeoutMs) {
            adminDisplay.current.building = false
            setDisplay('building', false)
          }
        } catch (e) {
          // Ignore
        }
      }
      // Ensure current template dependent state is reloaded when domain prepare or update is completed.
      if (adminDisplay.current &&
        ( ! adminState.display.preparing && adminState.display.preparing !== adminDisplay.current.preparing)
      ) {
        console.log(`Prepare/Update to new template ${adminState.config.templateId} is complete. Refreshing Editors.`)
        setTemplateId(adminState.config.templateId)
      }
      // End fast polling if there's no required states set to truthy.
      adminDisplay.current = adminState.display
      const activeStates = Object.keys(serverStates).filter(p => serverStates[p] && adminState.display[p])
      if (activeStates.length === 0) {
        endFastPolling()
      }
      // Show/Hide 'changing domain' dialog if we're in that state
      setShowChangingDomain(adminState.display.setDomain)
      // Show/Hide 'Preparing Template' dialog if we're in that state
      setShowPreparingTemplate(adminState.display.preparing)
      // Inform any watchers that the display state changed.
      setDisplayStateChanged(Date.now())
    }
    // Captured logs list changed
    if ( ! deepEqual(adminState.capturedLogs, capturedLogsCache.current)) {
      if (adminState.capturedLogs) {
        capturedLogsCache.current = adminState.capturedLogs
        setCapturedLogs(adminState.capturedLogs)
        setCapturingLogs(false)
      }
    }
    // domains or available domains changed
    if (! (deepEqual(adminDomains.current, adminState.domains)
           && deepEqual(availableDomainsCache.current, adminState.availableDomains)))
    {
      availableDomainsCache.current = adminState.availableDomains
      if (adminState.domains && adminState.availableDomains) {
        adminDomains.current = adminState.domains
        setAvailableDomains(getAvailableDomainsList(adminState.domains, adminState.availableDomains))
      }
    }
  }, [setShowChangingDomain, setDisplay, setAdminConfigChanged])

  // Ensure the current and base domains are in the domains list, even if no others.
  function getAvailableDomainsList(domains, availableDomains) {
    const list = [...availableDomains]
    if (domains.current) {
      list.unshift({
        domain: domains.current,
        arn: domains.currentArn,
        testDomain: domains.currentTest,
        testArn: domains.currentTestArn
      })
    }
    if (domains.base && domains.base !== domains.current) {
      list.push({
        domain: domains.base,
        testDomain: domains.baseTest,
        listName: domains.base + ((domains.current !== domains.base) ? ' (Browser will reload)' : '')
      })
    }
    return list
  }

  // Start refresh each STATE_POLL_INTERVAL_MS. Only if unlocked.
  function startFastPolling() {
    console.log('Start fast polling')
    setAdminStatePollIntervalMs(ADMIN_STATE_POLL_INTERVAL_FAST)
    fastPollingTimeoutId = setTimeout(function() {
      endFastPolling()
    }, FastPollingTimeoutMs)
  }

  /** Return to slow refresh */
  function endFastPolling() {
    console.log('End fast polling')
    setAdminStatePollIntervalMs(ADMIN_STATE_POLL_INTERVAL_DEFAULT)
    clearTimeout(fastPollingTimeoutId)
  }

  const domainControlTooltip = useCallback(isRefresh => {
    if (adminDisplay.current.getDomError) {
      return adminDisplay.current.getDomErrMsg || `Failed to get list of available domains.`
    }
    if (adminDisplay.current.setDomError) {
      return adminDisplay.current.setDomErrMsg || `Failed to set site domain.`
    }
    if (adminDisplay.current.cfDistUpdating) {
      return LIST_DOMAIN_TOOLTIP_UPDATING
    }
    if (isRefresh) {
      return window.location.host !== adminDomains.current.current
      ? REFRESH_DOMAIN_TOOLTIP + ' ' + adminDomains.current.current
      : ''
    }
    return LIST_DOMAIN_TOOLTIP
  }, [])

  // Handlers
  const advancedModeClick = () => setAdvancedMode(!advancedMode)
  const refreshLocationClick = () => refreshLocation()

  // Browser window reload as needed
  //   windowReload is set to the URL to us for the reload.
  //   reload will happen in 2s after this effect is triggered.
  useEffect(() => {
    if (windowReload) {
      setTimeout(() => {
        const newUrl = new URL(window.location.href)
        newUrl.host = windowReload
        newUrl.searchParams.set('lock', Controller.getLockId())
        window.location.href = newUrl.toString()
      }, 2000)
    }
  }, [windowReload])

  const setDomain = (domain) => {
    setDisplay('setDomain', true)
    startFastPolling()
    // If the selected domain is the CF base domain, then _remove_ the custom domain, otherwise,
    // change/add custom domain.
    if (domain.domain === adminDomains.current.base) {
      controller.sendCommand('setSiteDomain', { domains: adminDomains.current })
      setShowChangingDomain(true)
      // Auto-update browser location to the base domain before we lose access to the custom domain
      setWindowReload(adminDomains.current.base)
    } else {
      controller.sendCommand('setSiteDomain', { domains: adminDomains.current, newDomain: domain })
      // Don't upate browser here. Let the user select that if they want it.
      setShowChangingDomain(true)
    }
  }

  // Update the browser to the domain listed as current in the state.
  const refreshLocation = () => {
    // TODO: What happens when the state dissagrees with the current setting in the dropdown list? Seems like that
    // could be unnexpected for the user? We'll keep this button disabled while CF is updating, and while setDomain
    // is running, so the list and state _should_ agree, but might not?
    if ( ! adminDisplay.current.cfDistUpdating && window.location.host !== adminDomains.current.current) {
      const newUrl = new URL(window.location.href)
      newUrl.host = adminDomains.current.current
      newUrl.searchParams.set('lock', Controller.getLockId())
      window.location.href = newUrl.toString()
    }
  }

  const setTemplate = (templateId) => {
    if (templateId) {
      setDisplay('preparing', true)
      setTemplateId(null)
      // TODO: The 'config' and 'template' commands both update the template ID in the config.
      //    Thouhg the 'template' command also overwrites the current site settings & schema with
      //    the selected template. Is this 'config' command call here really needed?
      controller.sendCommand('config', { templateId: templateId })
      adminConfig.current.templateId = templateId
      setEditorsEnabled(false)
      editors.current = []
      controller.sendCommand('template', { id: templateId })
      startFastPolling()
      setShowPreparingTemplate(true)
      setShowSelectTemplate(false)
    }
  }

  const doSaveSiteName = () => {
    console.log(`In edit site name. New name: ${siteNameInput.current.value}`)
    adminConfig.current.siteName = siteNameInput.current.value
    controller.sendCommand('config', { siteName: siteNameInput.current.value })
    setEditingSiteName(false)
  }

  const doEditSiteName = () => {
    if (locked) { return }
    setEditingSiteName(true)
  }

  const onLoadTemplate = () => {
    setShowSelectTemplate(true)
  }

  const onUpdateTemplate = () => {
    setDisplay('updatingTemplate', true)
    console.log('Start update template: display state', adminDisplay)
    controller.sendCommand('updateTemplate', { id: adminConfig.current.templateId })
    startFastPolling()
  }

  const onUpdateAdminUi = () => {
    setDisplay('updatingUi', true)
    // Don't update the recovery path if we're currently running an update _from_ the recovery path!
    const recoveryPath = /recovery/.test(window.location.path)
    controller.sendCommand('updateAdminUi', { updateRecoveryPath: !recoveryPath })
    startFastPolling()
  }

  const doSetPassword = () => {
    setDisplay('settingPwd', true)
    controller.sendCommand('setPassword', { newPassword: newPassword.current.value })
    newPassword.current.value = ''
    startFastPolling()
  }

  const onCaptureLogs = () => {
    setDisplay('getLogs', true)
    controller.sendCommand('captureLogs', { durationH: 1 }, { byPassLocked: true })
    setCapturingLogs(true)
    startFastPolling()
  }

  const onGenerate = () => {
    setDisplay('building', true)
    setDisplay('buildingStart', Date.now())
    controller.sendCommand('build', { id: adminConfig.current.templateId, debug: advancedMode })
    startFastPolling()
  }

  const onPublish = () => {
    setDisplay('deploying', true)
    controller.sendCommand('publish')
    setTimeout(() => {
      console.log(`Cancel publishing state after 5 minutes. Server-side generator timed out.`)
      setDisplay('deploying', false)
    }, 5 * 60 * 1000)
    startFastPolling()
  }

  // On a 1 second debounce, check if the current entered password is valid, and set the auth state occordingly.
  const passwordChanging = (ev) => {
    clearTimeout(passwordChangingDebounce)
    passwordChangingDebounce = setTimeout(async () => {
      setAuthErrorMsg('')
      const currPwd = ev.target.value
      if (currPwd.length > 0) {
        setAuthState('pending')
        try {
          if (await controller.validatePassword(currPwd)) {
            setAuthState('success')
            controller.setPassword(currPwd)
          } else {
            setAuthState('fail')
            setAuthErrorMsg('Invalid password')
          }
        } catch (error) {
          console.error('Unable to authenticate with server.', error)
          setAuthState('unknown')
        }
      }
    }, 1000)
  }

  // On Editor tab change, pull the config file for this tab, if we haven't already cached it
  // and set the current edit item path to the last saved ath for this editor.
  const editorTabChange = async (index) => {
    //
    async function loadAndCacheConfig(configId) {
      const raw = await controller.getSiteConfig(adminConfig.current.templateId, configId)
      raw.content.contentType = raw.contentType // Copy response content-type to content for later use.
      raw.content.isConfig = true // Add config flag, for use later in uploading.
      configs.current[configId] = raw.content
      return raw.content
    }
    //
    const prevEditor = editors.current[prevEditorIndex.current]
    if (prevEditor) {
      prevEditor.lastEditPath = [...path]
    }
    //
    const editor = editors.current[index]
    const configId = editor.id
    if ( ! configs.current[configId]) {
      await loadAndCacheConfig(configId)
    }
    await Util.processDynamicProperties(configs.current, configs.current[configId].schema, loadAndCacheConfig)
    await Util.processDynamicLists(configs.current, configs.current[configId].schema, loadAndCacheConfig)
    setPath(editor.lastEditPath)
    prevEditorIndex.current = index
  }

  // EditorTab Component
  function EditorTab({editor}) {
    const config = configs.current[editor.id]
    if (config) {
      return <Editor
        editor={editor}
        configs={configs}
        path={path}
        setPath={setPath}
        fileContent={fileContent}
        contentUpdate={contentUpdate}
        setContentUpdate={setContentUpdate}
        contentToPut={contentToPut}
        putContentComplete={putContentComplete}
        getContent={(path) => controller.getSiteContent(adminConfig.current.templateId, path)}
        deleteContent={(path) => controller.deleteContent(adminConfig.current.templateId, path)}
        advancedMode={advancedMode}
        locked={locked}
      />
    }
    return null
  }

  /** React to document visibilty changes (whether page is visible to the user or not) */
  // Get config data from the server
  useEffect(() => {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === 'visible') {
        controller.checkState().then(async () => {
          setAdminState(controller.getConfig())
        })
      }
    });
  }, [setAdminState])

  // Get config data from the server
  useEffect(() => {
    try {
      if (authenticated && editors.current.length === 0) {
        // If a template ID is saved in the admin state, also pull the list of editors from the server
        console.log(`Update Editor config data from server. Template: ${templateId}`)
        if (templateId) {
           controller.getEditors(templateId)
            .then(async editorsData => {
              if (editorsData) {
                const editorId = editorsData[0].id
                // Init local editor data values
                editorsData = editorsData.map(editor => {
                  editor.lastEditPath = [{ name: editor.id }]
                  return editor
                })
                const raw = await controller.getSiteConfig(templateId, editorId)
                raw.content.contentType = raw.contentType // Copy response content-type to content for later use.
                raw.content.isConfig = true // Add config flag, for use later in uploading.
                configs.current[editorId] = raw.content
                editors.current = editorsData
                setPath([{ name: editorId }])
                setEditorsEnabled(true)
                setShowPreparingTemplate(false)
              }
            })
        }
      }
    } catch (error) {
      console.error('Failed Get editors init.', error)
    }
  }, [authenticated, templateId])

  // Hide login dialog on auth success, but delay for a couple of seconds so it's not so jarring to the user.
  useEffect(() => {
    if (authState === 'success') {
      let minWait = 3  // wait min 1.5 seconds before dropping login modal
      let maxWait = 20  // wait max. 10 seconds for adminConfig from the server.
      const cancel = setInterval(() => {
        if (minWait <= 0 && ! adminConfig.current.new) {
          setShowLogin(false)
          if ( ! adminConfig.current.templateId) {
            controller.getTemplates().then(tplList => {
              templates.current = tplList
              setShowSelectTemplate(true)
            })
          }
          clearInterval(cancel)
        }
        --maxWait
        --minWait
        if (maxWait === 0) {
          setAuthState('fail')
          setAuthErrorMsg('Failed to get admin state.')
          clearInterval(cancel)
        }
      }, 500)
    }
  }, [authState, setShowLogin, setShowSelectTemplate])

  // Disable show preparing template when preparing is complete
  useEffect(() => {
    if ( ! adminDisplay.current.preparing) {
      setShowPreparingTemplate(false)
      endFastPolling()
    }
  }, [setShowPreparingTemplate])

  const setPollAdminStateError = useCallback(error => {
    console.log('Failed to get state from server.', error)
    setAdminStatePollIntervalMs(ADMIN_STATE_POLL_INTERVAL_DEFAULT)
  }, [setAdminStatePollIntervalMs])

  // Support for manage saved settings button state:
  const manageTemplates = {
    loadingText: useMemo(() => {
      if (adminDisplay.current.saveTpl) { return 'Saving...' }
      if (adminDisplay.current.renTpl) { return 'Renaming...' }
      if (adminDisplay.current.delTpl) { return 'Deleting...' }
      return 'Working...'
    }, [adminDisplay]),
    loading: useMemo(() => {
      return adminDisplay.current.saveTpl || adminDisplay.current.renTpl || adminDisplay.current.delTpl
    }, [adminDisplay]),
    error: useMemo(() => {
      return adminDisplay.current.tplError || adminDisplay.current.renTplError || adminDisplay.current.delTplError
    }, [adminDisplay]),
    errorMsg: useMemo(() => {
      return adminDisplay.current.saveTplError || adminDisplay.current.renTplError || adminDisplay.current.delTplError
    }, [adminDisplay])
  }

  const siteName = useMemo(() => {
    if ( editingSiteName !== undefined && adminConfigChanged) {
      if (adminConfig.current.siteName) { return adminConfig.current.siteName }
      if (adminConfig.current.templateId) { return adminConfig.current.templateId + ' Site Admin' }
    }
    return 'Site Admin'
  }, [editingSiteName, adminConfigChanged])


  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // UI
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  return (
    <ChakraProvider theme={customTheme}>
      <PollLockState controller={controller} authenticated={authenticated} setLocked={setLocked}/>
      <PollCfState controller={controller} domains={adminDomains.current} authenticated={authenticated}/>
      <PollAdminState
        controller={controller} intervalMs={adminStatePollIntervalMs} setAdminState={setAdminState}
        setError={setPollAdminStateError}
      />
      <PollAvailableDomains controller={controller} authenticated={authenticated}/>
      <PollPutContent
        controller={controller} adminConfig={adminConfig} contentToPut={contentToPut}
        setPutContentComplete={setPutContentComplete} setUploadError={setUploadError}
      />
      <Grid
        h='calc(100vh - 12px)'
        bg='accent'
        templateAreas={`
          "header"
          "build"
          "edit"
          "footer"
        `}
        templateRows={'2.5em 1fr 1em'}
        templateColumns={'1fr'}
      >
        <GridItem color='baseText' bg='accent' h='2.75em' isDisabled={displayStateChanged === null}>
          <Flex h='2.75em' p='5px 1em 5px 5px'>
            <Image src="./favicon.ico" h='32px' w='32px' m='0 0.5em 0 0' style={{border:'none'}}/>
            {editingSiteName
              ? <>
                  <Input color='accentText' ref={siteNameInput} size='xs' w='20em' defaultValue={siteName}/>
                  <CheckIcon color='accentText' m='3px' h='14px' w='14px' onClick={doSaveSiteName}/>
                  <CloseIcon color='accentText' m='3px' h='12px' w='12px' onClick={() => setEditingSiteName(false)}/>
                </>
              : <Text color='accentText' whiteSpace='nowrap' m='2px' onClick={doEditSiteName}>{`${siteName}`}</Text>
            }
            <Text color='danger' whiteSpace='nowrap' m='2px' hidden={!locked}>(Read Only)</Text>
            <Spacer m='3px'/>
            <Tooltip openDelay={1050} closeDelay={250} hasArrow={true} placement='bottom-end' label={domainControlTooltip(false)} autoFocus={false}>
              <Select size='sm' m='-2px 0 2px 0' maxW='20em' border='none' color='accentText' autoFocus={false}
                value={availableDomains[0]} isDisabled={locked || adminDisplay.current.cfDistUpdating}
                bg={(adminDisplay.current.getDomError || adminDisplay.current.setDomError) ? 'danger' : 'accent'}
                onChange={ev => {
                  setDomain(availableDomains[ev.target.value])
                }}
              >
                {availableDomains.map((listValue, index) => {
                  return <option key={index} value={index} align='right'>{listValue.listName || listValue.domain}</option>
                })}
              </Select>
            </Tooltip>
            <Tooltip openDelay={650} closeDelay={250} hasArrow={true} placement='bottom-end' label={domainControlTooltip(true)} autoFocus={false}>
              <RepeatIcon m='3px'
                color={(adminDisplay.current.cfDistUpdating || window.location.host === adminDomains.current.current) ? 'gray' : 'accentText'}
                focusable={true} autoFocus={false} onClick={refreshLocationClick}
              />
            </Tooltip>
            <Spacer m='8px'/>
            <ActionButton text='Generate' onClick={onGenerate} w='16em' minW='16em' maxW='16em'
                tooltip={{ text: advancedMode ? BUTTON_GENERATE_DEBUG_TOOLTIP : BUTTON_GENERATE_TOOLTIP, placement: 'left-end' }}
                errorFlag={adminDisplay.current.buildError} errorText={adminDisplay.current.buildErrMsg}
                isDisabled={(!authenticated || locked || adminDisplay.building) && !advancedMode}
                isLoading={adminDisplay.current.building && !advancedMode} loadingText='Generating...'/>
            <Link href={`https://${adminDomains.current.currentTest}/`} size='sm' whiteSpace='nowrap' color='accentText' isExternal>Test Site <ExternalLinkIcon mx='2px'/></Link>
            <ActionButton text='Publish' onClick={onPublish} w='15em' minW='15em' maxW='15em'
                tooltip={{ text: BUTTON_PUBLISH_TOOLTIP, placement: 'left-end' }}
                errorFlag={adminDisplay.current.publishError} errorText={adminDisplay.current.publishErrMsg}
                isDisabled={(!authenticated || locked || adminDisplay.current.deploying) && !advancedMode}
                isLoading={adminDisplay.current.deploying && !advancedMode} loadingText='Publishing...'/>
            <Link href={`https://${adminDomains.current.current}/`} size='sm' whiteSpace='nowrap' color='accentText' isExternal>Site <ExternalLinkIcon mx='2px'/></Link>
          </Flex>
        </GridItem>
        <GridItem bg='editorBg' >
          <Skeleton
            isLoaded={editorsEnabled}
            hidden={showLogin || showSelectTemplate || showPreparingTemplate}
            height='100%'
          >
            <Tabs size='sm' h='1em' isManual isLazy lazyBehavior='keepMounted' onChange={editorTabChange}>
              <TabList bg='accent'>
                {editors.current.map((editor) => {
                  const inError = uploadError === editor.id
                  return <Tab key={editor.id}
                      isDisabled={!authenticated} bg={inError ? 'danger' : null}
                    >{editor.title}</Tab>
                })}
              </TabList>
              <TabPanels bg='editorBg' maxHeight='calc(100vh - 6.25em)'>
                {editors.current.map((editor) => (
                  <TabPanel p='0' key={'Tab_' + editor.id}>
                    <Skeleton isLoaded={configs.current[editor.id]} hidden={configs.current[editor.id]} height='calc(100vh - 6.3em)'/>
                    <EditorTab key={'EditorTab_' + editor.id} editor={editor}/>
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          </Skeleton>
        </GridItem>
        <GridItem h='1.6em' bg='accent' isDisabled={displayStateChanged === null}>
          <Flex p='3px 5px'>
            <Text fontSize='xs' m='2px 5px 0 0' color='accentText'>Copyright BraeVitae 2023</Text>
            <InfoOutlineIcon m='3px' color={advancedMode ? 'accentActiveText' : 'accentText'} onClick={advancedModeClick}/>
            <Spacer/>
            {advancedMode ? [
              <ActionButton text='Load Template' onClick={onLoadTemplate} buttonStyle={{ size: 'xs' }}
                tooltip={{ text: BUTTON_LOAD_TEMPLATE, placement: 'right-end' }}
                isDisabled={!authenticated || locked}/>,
              ]
            : null}
            <ActionButton text='Capture Logs' onClick={onCaptureLogs} buttonStyle={{ size: 'xs' }}
                tooltip={{ text: BUTTON_CAPTURE_LOGS, placement: 'right-end' }}
                isLoading={capturingLogs && !advancedMode} loadingText='Capturing...'
                errorFlag={adminDisplay.current.getLogsError} errorText={adminDisplay.current.getLogsErrMsg}
                isDisabled={!authenticated}/>
            {capturedLogs.length > 0 ?
              <Popover placement='top-end' gutter={20} isDisabled={!authenticated}>
                {({ onClose }) => {
                  return <><PopoverTrigger>
                    <Button size='xs' h='1.5em' m='0 0.5em'
                      color='accent' _hover={{ bg: 'gray.400' }} bg='accentText'
                      isDisabled={!authenticated}
                    >Download Logs...</Button>
                  </PopoverTrigger>
                  <Portal>
                    <PopoverContent>
                      <PopoverArrow />
                      <PopoverBody>
                        <Text>{BUTTON_DOWNLOAD_LOGS_1}</Text>
                        <VStack spacing={0} align='stretch' margin='0.5em 0'>
                          {capturedLogs.map(logFile => {
                            return <Link key={logFile.url} href={logFile.url} target='_blank'>{logFile.name}</Link>
                          })}
                        </VStack>
                        <Text>{BUTTON_DOWNLOAD_LOGS_2}</Text>
                      </PopoverBody>
                    </PopoverContent>
                  </Portal></>
                }}
              </Popover>
              : null
            }
            <Popover placement='top-end' initialFocusRef={newPassword} gutter={20} isDisabled={!authenticated || locked}>
              {({ onClose }) => {
                return <><PopoverTrigger>
                  <Button size='xs' h='1.5em' m='0 0.5em'
                    color='accent' _hover={{ bg: 'gray.400' }} bg={adminDisplay.current.setPwdError ? 'danger' : 'accentText'}
                    isDisabled={!authenticated || locked}
                    isLoading={adminDisplay.current.settingPwd && !advancedMode} loadingText='Changing...'
                  >Change Password...</Button>
                </PopoverTrigger>
                <Portal>
                  <PopoverContent>
                    <PopoverArrow />
                    <PopoverBody>
                      <Text>{adminDisplay.setPwdError ? BUTTON_SET_PASSWORD + '\n\n' + adminDisplay.current.setPwdErrMsg : BUTTON_SET_PASSWORD}</Text>
                      <HStack margin='0.5em 0'>
                        <Text>New Password:</Text><Input ref={newPassword} size='xs'></Input>
                      </HStack>
                      <HStack>
                        <Spacer/>
                        <Button size='xs' onClick={onClose}>Cancel</Button>
                        <Button size='xs' onClick={() => {doSetPassword(); onClose()}}>Set</Button>
                      </HStack>
                    </PopoverBody>
                  </PopoverContent>
                </Portal></>
              }}
            </Popover>
            <Popover placement='top-end' gutter={20} initialFocusRef={manageTplFocus} isDisabled={!authenticated || locked}>
              {({ onClose }) => {
                return <><PopoverTrigger>
                  {/* Unable to apply tooltip here mainly because popover and tooltop can't share the same elemet.
                    There's suppossed to be some constructs to get around this, but it's likely not work complicating
                     the UI code at this point just to have the tooltip, since it's just replicating the doc visible
                     on the popup.
                  */}
                  <Button size='xs' h='1.5em' m='0 0.5em'
                    color='accent' _hover={{ bg: 'gray.400' }} bg={adminDisplay.current.tplError ? 'danger' : 'accentText'}
                    isDisabled={!authenticated || locked || displayStateChanged === null}
                    isLoading={manageTemplates.loading && !advancedMode} loadingText={manageTemplates.loadingText}
                  >Saved Settings...</Button>
                </PopoverTrigger>
                <Portal>
                  <ManageTemplatesPopup
                    id={templateId} controller={controller} onClose={onClose}
                    templates={templates} focus={manageTplFocus}
                    headerText={BUTTON_MANAGE_TEMPLATES} errorMsg={adminDisplay.current.tplErrorMsg}
                    setDisplay={setDisplay} startFastPolling={startFastPolling} advancedMode={advancedMode}
                  />
                </Portal></>
              }}
            </Popover>
            {advancedMode ? [
              <ActionButton text='Update Template' onClick={onUpdateTemplate} buttonStyle={{ size: 'xs' }}
                tooltip={{ text: BUTTON_UPDATE_TEMPLATE_TOOLTIP, placement: 'left-start' }}
                errorFlag={adminDisplay.current.updateTemplateError} errorText={adminDisplay.current.updateTemplateErrMsg}
                isDisabled={!authenticated || locked}
                isLoading={adminDisplay.current.updatingTemplate && !advancedMode} loadingText='Updating...'/>,
              <ActionButton text='Update Site Admin' onClick={onUpdateAdminUi} buttonStyle={{ size: 'xs' }}
                tooltip={{ text: BUTTON_UPDATE_UI_TOOLTIP, placement: 'left-start' }}
                errorFlag={adminDisplay.current.updateUiError} errorText={adminDisplay.current.updateUiErrMsg}
                isDisabled={!authenticated || locked}
                isLoading={adminDisplay.current.updatingUi && !advancedMode} loadingText='Updating...'/>
            ] : null}
          </Flex>
        </GridItem>
      </Grid>

      <Modal isOpen={showChangingDomain}>
        <ModalOverlay />
        <ChangingDomain/>
      </Modal>

      <Modal isOpen={showPreparingTemplate && ! showSelectTemplate && ! showLogin}>
        <ModalOverlay />
        <PreparingTemplate templates={templates} adminConfig={adminConfig} />
      </Modal>

      <Modal isOpen={showSelectTemplate && ! showLogin}>
        <ModalOverlay />
        <SelectTemplate
          controller={controller} templates={templates} setTemplate={setTemplate} setShowModal={setShowSelectTemplate}
        />
      </Modal>

      <Modal isOpen={showLogin}>
        <ModalOverlay/>
        <Login authState={authState} authErrorMsg={authErrorMsg} passwordChanging={passwordChanging} />
      </Modal>
    </ChakraProvider>
  )
}

export default App
