import React, { useState, useRef, useEffect } from 'react'
import {
  ChakraProvider, extendTheme, Text, Link, Flex, Spacer, Grid,GridItem, Tabs, TabList, TabPanels,
  Tab, TabPanel, Skeleton, Modal, ModalOverlay, Popover, PopoverArrow, PopoverBody, Image,
  PopoverTrigger, PopoverContent, Portal, Button, Input, HStack, VStack, Textarea, Select, Tooltip
} from '@chakra-ui/react'
import { ExternalLinkIcon, InfoOutlineIcon, RepeatIcon } from '@chakra-ui/icons'
import { mode } from '@chakra-ui/theme-tools'
import Controller from './Controller'
import Editor from './Editor'
import Login from './Login'
import ChangingDomain from './ChangingDomain'
import SelectTemplate from './SelectTemplate'
import PreparingTemplate from './PreparingTemplate'
import deepEqual from 'deep-equal'
import Util from './Util'
import ActionButton from './ActionButton'
import EditorText from './EditorText'

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
const BUTTON_SAVE_TEMPLATE = 'Save all current configuraton settings to a new template bundle.'
const BUTTON_SET_PASSWORD = 'Change the site admin password'
const BUTTON_CAPTURE_LOGS = 'Capture the last 1 hour of logs to a text file.'
const BUTTON_DOWNLOAD_LOGS_1 = 'Captured log files available for download.'
const BUTTON_DOWNLOAD_LOGS_2 = 'Log files will be removed 1 hour after capture.'
const REFRESH_DOMAIN_TOOLTIP = 'Refresh the browser page to match the current active domain: '

// Drive controller logic at a rate set by the UI:
// Check state as needed (variable rate)
const STATE_POLL_INTERVAL_MS = 500
let maxPollingLoopCount = 30  // Skip this many poll intervals before checking server state.
let adminStatePoller = null
let lockStatePoller = null
let putContentWorker = null
const FastPollingTimeoutMs = 5 * 60 * 1000
let fastPollingTimeoutId = null
let pollLoopCount = 0
let passwordChangingDebounce = null

// Known Server States (If true, check for end fast polling. false here implies server state may not be reliably cleaned up.)
const serverStates = {
  preparing: true,
  deploying: true,
  building: true,
  updatingTemplate: true,
  updatingUi: true,
  getLogs: true,
  savingTemplate: true,
  settingPassword: true,
  setDomain: true
}

// Start refresh each STATE_POLL_INTERVAL_MS. Only if unlocked.
function startFastPolling() {
  console.log('Start fast polling')
  maxPollingLoopCount = 1
  fastPollingTimeoutId = setTimeout(function() {
    endFastPolling()
    fastPollingTimeoutId = null
  }, FastPollingTimeoutMs)
}

/** Return to slow refresh */
function endFastPolling() {
  console.log('End fast polling')
  maxPollingLoopCount = 30
  if (fastPollingTimeoutId) {
    clearTimeout(fastPollingTimeoutId)
    fastPollingTimeoutId = null
  }
}

/** React to document visibilty changes (whether page is visible to the user or not) */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === 'visible') {
    // Poll on the next tick
    pollLoopCount = maxPollingLoopCount
  } else {
    endFastPolling()
  }
});

//
function App() {
  // State
  const [windowReload, setWindowReload] = useState(null)
  const [showLogin, setShowLogin] = useState(true)
  const [showChangingDomain, setShowChangingDomain] = useState(false)
  const [showSelectTemplate, setShowSelectTemplate] = useState(false)
  const [showPreparingTemplate, setShowPreparingTemplate] = useState(false)
  const [advancedMode, setAdvancedMode] = useState(false)
  const [adminLive, setAdminLive] = useState(false)
  const [adminConfig, setAdminConfig] = useState({ new: true })
  const [adminTemplates, setAdminTemplates] = useState([])
  const [authState, setAuthState] = useState('unknown')
  const [authErrorMsg, setAuthErrorMsg] = useState('')
  const [locked, setLocked] = useState(false)
  const [editorsEnabled, setEditorsEnabled] = useState(false)
  const [path, setPath] = useState([])
  const [contentToGet, setContentToGet] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [capturedLogs, setCapturedLogs] = useState([])
  const [availableDomains, setAvailableDomains] = useState([])
  const [cfDistUpdating, setCfDistUpdating] = useState(false)
  const [capturingLogs, setCapturingLogs] = useState(false)

  // Calculated State
  const authenticated = authState === 'success'

  // Global Refs
  const editors = useRef([])
  const configs = useRef({})
  const adminDisplay = useRef({})
  const adminDomains = useRef({})
  const prevEditorIndex = useRef(null)
  const contentToPut = useRef({})
  const putContentComplete = useRef({})
  const fileContent = useRef({})
  const currTemplate = useRef({})
  const saveTemplateName = useRef({})
  const saveTemplateDesc = useRef({})
  const newPassword = useRef({})

  // Indicate there's new content to put on this path
  const scheduleContentPush = (path, source, id, editorId) => {
    putContentComplete.current[path] = null
    contentToPut.current[path] = {
      source: source,
      id: id,
      editorId: editorId,
      state: 'new'
    }
  }

  const setDisplay = (prop, value) => {
    if (serverStates[prop] === undefined) {
      console.log(`Using unsupported display state: ${prop}`)
    }
    adminDisplay.current[prop] = value
  }

  // Handlers
  const advancedModeClick = () => setAdvancedMode(!advancedMode)
  const refreshLocationClick = () => refreshLocation()

  // Browser window reload as needed
  //   windowReload is set to the URL to us for the reload.
  //   reload will happen in 2s after this effect is triggered.
  useEffect(() => {
    if (windowReload) {
      setTimeout(() => {
        window.location.host = windowReload
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
    if ( ! cfDistUpdating && window.location.host !== adminDomains.current.current) {
      window.location.host = adminDomains.current.current
    }
  }

  const setTemplateId = (templateId) => {
    if (templateId) {
      controller.sendCommand('config', { templateId: templateId })
      const newConfig = Object.assign({}, adminConfig)
      newConfig.templateId = templateId
      setEditorsEnabled(false)
      editors.current = []
      setAdminConfig(newConfig)
      controller.sendCommand('template', { id: templateId })
      currTemplate.current = adminTemplates.find(t => t.id === templateId)
      startFastPolling()
      // TODO: It seems like the 'setAdminConfig' above, does not update the adminConfig record
      // in the preparingTemplate modal, so it still says 'preparing Author template' when a different
      // template is selected.
      setShowPreparingTemplate(true)
      setShowSelectTemplate(false)
    }
  }

  const onLoadTemplate = () => {
    setShowSelectTemplate(true)
  }

  const onUpdateTemplate = () => {
    setDisplay('updatingTemplate', true)
    console.log('Start update template: display state', adminDisplay)
    controller.sendCommand('updateTemplate', { id: adminConfig.templateId })
    startFastPolling()
  }

  const onUpdateAdminUi = () => {
    setDisplay('updatingUi', true)
    // Don't update the recovery path if we're currently running an update _from_ the recovery path!
    const recoveryPath = /recovery/.test(window.location.path)
    controller.sendCommand('updateAdminUi', { updateRecoveryPath: !recoveryPath })
    startFastPolling()
  }

  const doSaveTemplate = () => {
    setDisplay('savingTemplate', true)
    controller.sendCommand('saveTemplate', {
      id: adminConfig.templateId,
      name: saveTemplateName.current.value,
      desc: saveTemplateDesc.current.value || `A custom template derived from ${adminConfig.templateId}`,
      overwrite: advancedMode
    })
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
    controller.sendCommand('captureLogs', { durationH: 1 })
    setCapturingLogs(true)
    startFastPolling()
  }

  const onGenerate = () => {
    setDisplay('building', true)
    controller.sendCommand('build', { id: adminConfig.templateId, debug: advancedMode })
    setTimeout(() => {
      console.log(`Cancel generating state after 15 minutes. Server-side generator timed out.`)
      setDisplay('building', false)
    }, 15 * 60 * 1000)
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
      const raw = await controller.getSiteConfig(adminConfig.templateId, configId)
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
        getContent={path => {
          fileContent.current[path] = { state: 'pending' }
          // TODO: This setPath call is triggering the " Cannot update a component (`App`) while rendering a different component (`Editor`)." warning
          setContentToGet({ path: path })
        }}
        pushContent={scheduleContentPush}
        putContentComplete={putContentComplete}
        deleteContent={(path) => { controller.deleteContent(adminConfig.templateId, path) }}
        advancedMode={advancedMode}
        locked={locked}
      />
    }
    return null
  }

  // Invoke when admin state polling determines something in the state has changed (new state from server)
  const setAdminState = (adminState) => {
    if ( ! adminLive) {
      setAdminConfig(adminState.config)
      setAdminTemplates(adminState.templates)
      adminDisplay.current = adminState.display
      // Show domain change UI on reload if it's still active.
      if (adminState.display.setDomain === true) {
        setShowChangingDomain(true)
      }
      setCfDistUpdating(adminDisplay.current.cfDistUpdating)
      if ( ! cfDistUpdating) {
        controller.sendCommand('getAvailableDomains')
      }
      if (adminState.domains) {
        adminDomains.current = adminState.domains
      }
      if (adminState.config.templateId) {
        currTemplate.current = adminState.templates.find(t => t.id === adminState.config.templateId)
      }
      if (adminState.capturedLogs) {
        setCapturedLogs(adminState.capturedLogs)
      }
      setAdminLive(true)
    } else {
      if ( ! deepEqual(adminState.config, adminConfig)) {
        setAdminConfig(adminState.config)
      }
      if ( ! deepEqual(adminState.display, adminDisplay.current)) {
        console.log('Update display state', adminState.display)
        adminDisplay.current = adminState.display
        const activeStates = Object.keys(serverStates).filter(p => serverStates[p] && adminState.display[p])
        if (activeStates.length === 0) {
          endFastPolling()
        }
        if (showChangingDomain && adminState.display.setDomain === false) {
          setShowChangingDomain(false)
          // Clear available domains so it will get re-set to the current admin state. This will ensure the dropdown list
          // and it's active selection is kept up to date.
          setAvailableDomains([])
        }
        {
          const prev = cfDistUpdating
          setCfDistUpdating(adminDisplay.current.cfDistUpdating)
          if (prev && ! cfDistUpdating) {
            controller.sendCommand('getAvailableDomains')
          }
        }
      }
      if ( ! deepEqual(adminState.templates, adminTemplates)) {
        setAdminTemplates(adminState.templates)
      }
      if ( ! deepEqual(adminState.domains, adminDomains.current)) {
        if (adminState.domains) {
          adminDomains.current = adminState.domains
        }
      }
      if ( ! deepEqual(adminState.capturedLogs, capturedLogs)) {
        if (adminState.capturedLogs && adminState.capturedLogs.length !== undefined) {
          setCapturedLogs(adminState.capturedLogs)
          setCapturingLogs(false)
        }
      }
    }
    // Update available domains
    //    Ensure the current and base domains are in the domains list, even if no others.
    if (adminState.domains && adminState.availableDomains) {
      const domains = [...adminState.availableDomains]
      if (adminState.domains.current) {
        domains.unshift({
          domain: adminState.domains.current,
          arn: adminState.domains.currentArn,
          testDomain: adminState.domains.currentTest,
          testArn: adminState.domains.currentTestArn
        })
      }
      if (adminState.domains.base && adminState.domains.base !== adminState.domains.current) {
        domains.push({
          domain: adminState.domains.base,
          testDomain: adminState.domains.baseTest,
          listName: adminState.domains.base + ((adminState.domains.current !== adminState.domains.base) ? ' (Browser will reload)' : '')
        })
      }
      setAvailableDomains(domains)
    }
  }

  //
  useAdminStatePolling(adminLive, setAdminState)
  useLockStatePolling(setLocked)
  usePutContentWorker(controller, adminConfig, contentToPut, putContentComplete, setUploadError)

  // Get config data from the server
  useEffect(() => {
    try {
      if (authenticated && editors.current.length === 0) {
        // If a template ID is saved in the admin state, also pull the list of editors from the server
        if (adminConfig.templateId) {
           controller.getEditors(adminConfig.templateId)
            .then(async editorsData => {
              if (editorsData) {
                const editorId = editorsData[0].id
                // Init local editor data values
                //    Drop any editors with no schema
                editorsData = editorsData
                  .filter(p => !!p.schema)
                  .map(editor => {
                    editor.lastEditPath = [{ name: editor.id }]
                    editor.type = 'properties'
                    return editor
                  })
                  .concat({
                    type: 'notes',
                    data: 'conf/notes.json'
                  })
                const raw = await controller.getSiteConfig(adminConfig.templateId, editorId)
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
  }, [adminConfig, authenticated])

  // Get content data from the server on start editing
  useEffect(() => {
    if (contentToGet && contentToGet.path) {
      let toGet = fileContent.current[contentToGet.path]
      if ( ! toGet || toGet.state !== 'complete' || toGet.state !== 'pending') {
        if ( ! toGet) {
          toGet = {}
          fileContent.current[contentToGet.path] = toGet
        }
        toGet.state = 'pending'
        controller.getSiteContent(adminConfig.templateId, contentToGet.path)
        .then(contentRec => {
          setContentToGet(null)
          if (contentRec) {
            toGet.content = contentRec.content
            toGet.contentType = contentRec.contentType
            toGet.state = 'complete'
          } else {
            toGet.state = 'fail'
          }
        })
        .catch(error => {
          setContentToGet(null)
          toGet.state = 'fail'
        })
      }
    }
  },[adminConfig, contentToGet])

  // Hide login dialog on auth success, but delay for a couple of seconds so it's not so jarring to the user.
  useEffect(() => {
    if (authState === 'success') {
      let minWait = 3  // wait min 1.5 seconds before dropping login modal
      let maxWait = 20  // wait max. 10 seconds for adminConfig from the server.
      const cancel = setInterval(() => {
        if (minWait <= 0 && ! adminConfig.new) {
          setShowLogin(false)
          if ( ! adminConfig.templateId) {
            setShowSelectTemplate(true)
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
  }, [authState, setShowLogin, adminConfig.templateId, adminConfig.new, setShowSelectTemplate])

  // Disable show preparing template when preparing is complete
  useEffect(() => {
    if ( ! adminDisplay.preparing) {
      setShowPreparingTemplate(false)
      endFastPolling()
    }
  }, [adminDisplay.preparing, setShowPreparingTemplate])

  // UI
  return (
    <ChakraProvider theme={customTheme}>
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
        <GridItem color='baseText' bg='accent' h='2.75em'>
          <Flex h='2.75em' p='5px 1em 5px 5px'>
            <Image src="./favicon.ico" h='32px' w='32px' m='0 0.5em 0 0' style={{border:'none'}}/>
            <Text color='accentText' whiteSpace='nowrap' m='2px'>{adminConfig.templateId ? `${adminConfig.templateId} Site Admin` : 'Site Admin'}</Text>
            <Text color='danger' whiteSpace='nowrap' m='2px' hidden={!locked}>(Read Only)</Text>
            <Spacer m='3px'/>
            <Tooltip
              openDelay={1050} closeDelay={250} hasArrow={true} placement='bottom-end'
              label={cfDistUpdating ? LIST_DOMAIN_TOOLTIP_UPDATING : LIST_DOMAIN_TOOLTIP}
            >
              <Select size='sm' m='-2px 0 2px 0' border='none' color='accentText' autoFocus={false}
                disabled={locked || cfDistUpdating}
                onChange={ev => {
                  setDomain(availableDomains[ev.target.value])
                }}
              >
                {availableDomains.map((listValue, index) => {
                  return <option key={index} value={index} align='right'>{listValue.listName || listValue.domain}</option>
                })}
              </Select>
            </Tooltip>
            <Tooltip
              openDelay={650} closeDelay={250} hasArrow={true} placement='bottom-end'
              label={cfDistUpdating ? LIST_DOMAIN_TOOLTIP_UPDATING :
                  (window.location.host !== adminDomains.current.current ?
                    REFRESH_DOMAIN_TOOLTIP + ' ' + adminDomains.current.current : '')}
            >
              <RepeatIcon m='3px'
                color={(cfDistUpdating || window.location.host === adminDomains.current.current) ? 'gray' : 'accentText'}
                focusable={true} autoFocus={false} onClick={refreshLocationClick}
              />
            </Tooltip>
            <Spacer m='8px'/>
            {advancedMode ?
              <ActionButton text='Generate Debug' onClick={onGenerate}
                tooltip={{ text: BUTTON_GENERATE_DEBUG_TOOLTIP, placement: 'left-end' }}
                errorFlag={adminDisplay.buildError} errorText={adminDisplay.buildErrMsg}
                isDisabled={(!authenticated || locked || adminDisplay.building) && !advancedMode}
                isLoading={adminDisplay.building && !advancedMode} loadingText='Generating Debug...'/>
            : null}
            <ActionButton text='Generate' onClick={onGenerate} w='12em'
                tooltip={{ text: BUTTON_GENERATE_TOOLTIP, placement: 'left-end' }}
                errorFlag={adminDisplay.buildError} errorText={adminDisplay.buildErrMsg}
                isDisabled={(!authenticated || locked || adminDisplay.building) && !advancedMode}
                isLoading={adminDisplay.building && !advancedMode} loadingText='Generating...'/>
            <Link href={`https://${adminDomains.current.currentTest}/`} size='sm' whiteSpace='nowrap' color='accentText' isExternal>Test Site <ExternalLinkIcon mx='2px'/></Link>
            <ActionButton text='Publish' onClick={onPublish} w='10em'
                tooltip={{ text: BUTTON_PUBLISH_TOOLTIP, placement: 'left-end' }}
                errorFlag={adminDisplay.publishError} errorText={adminDisplay.publishErrMsg}
                isDisabled={(!authenticated || locked || adminDisplay.deploying) && !advancedMode}
                isLoading={adminDisplay.deploying && !advancedMode} loadingText='Publishing...'/>
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
                  if ( ! editor.schema) { return null}
                  return <Tab key={editor.id}
                      disabled={!authenticated} bg={inError ? 'danger' : null}
                    >{editor.title}</Tab>
                }).concat(
                  <Tab key='notes'
                    disabled={!authenticated} bg={(uploadError === 'notes') ? 'danger' : null}
                  >Notes</Tab>
                )}
              </TabList>
              <TabPanels bg='editorBg' maxHeight='calc(100vh - 6.25em)'>
                {editors.current.map((editor) => {
                  if ( ! editor.schema) { return null}
                  return <TabPanel p='0' key={'Tab_' + editor.id}>
                    <Skeleton isLoaded={configs.current[editor.id]} hidden={configs.current[editor.id]} height='calc(100vh - 6.3em)'/>
                    <EditorTab key={'EditorTab_' + editor.id} editor={editor}/>
                  </TabPanel>
                }).concat(
                  <TabPanel p='0' key='notes'>
                    <Skeleton isLoaded={true} height='calc(100vh - 6.3em)'/>
                    <Textarea
                    />
                  </TabPanel>
                )}
              </TabPanels>
            </Tabs>
          </Skeleton>
        </GridItem>
        <GridItem h='1.6em' bg='accent'>
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
                isDisabled={!authenticated || locked}/>
            {capturedLogs.length > 0 ?
              <Popover placement='top-end' gutter={20}>
                {({ onClose }) => {
                  return <><PopoverTrigger>
                    <Button size='xs' h='1.5em' m='0 0.5em'
                      color='accent' _hover={{ bg: 'gray.400' }} bg='accentText'
                      disabled={!authenticated || locked}
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
            <Popover placement='top-end' initialFocusRef={newPassword} gutter={20}>
              {({ onClose }) => {
                return <><PopoverTrigger>
                  <Button size='xs' h='1.5em' m='0 0.5em'
                    color='accent' _hover={{ bg: 'gray.400' }} bg={adminDisplay.setPwdError ? 'danger' : 'accentText'}
                    disabled={!authenticated || locked}
                    isLoading={adminDisplay.settingPwd && !advancedMode} loadingText='Changing...'
                  >Change Password...</Button>
                </PopoverTrigger>
                <Portal>
                  <PopoverContent>
                    <PopoverArrow />
                    <PopoverBody>
                      <Text>{adminDisplay.setPwdError ? BUTTON_SET_PASSWORD + '\n\n' + adminDisplay.setPwdErrMsg : BUTTON_SET_PASSWORD}</Text>
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
            <Popover placement='top-end' initialFocusRef={saveTemplateName} gutter={20}>
              {({ onClose }) => {
                return <><PopoverTrigger>
                  <Button size='xs' h='1.5em' m='0 0.5em'
                    color='accent' _hover={{ bg: 'gray.400' }} bg={adminDisplay.saveTemplateError ? 'danger' : 'accentText'}
                    disabled={!authenticated || locked}
                    isLoading={adminDisplay.savingTemplate && !advancedMode} loadingText='Saving...'
                  >Save Template...</Button>
                  {/* TODO: I would like to use my custom ActionButton here, but that needs 'forwardRef', and I can't get
                    it working (React complains that PopoverTrigger requires exactly one component)
                    I also can't get Chakra ToolTip working within Popover trigger, as a workaround. Error suggests
                    'forwardRef' is also needed :(
                    {forwardRef<ButtonProps, 'button'>((props, ref) => {
                    return <ActionButton as='button' text='Save Template' buttonStyle={{ size: 'xs' }}
                      tooltip={{ text: BUTTON_SAVE_TEMPLATE, placement: 'right-end' }}
                      isDisabled={!authenticated || locked} ref={ref} {...props}/>
                  })} */}
                </PopoverTrigger>
                <Portal>
                  <PopoverContent>
                    <PopoverArrow />
                    <PopoverBody>
                      <Text>{adminDisplay.saveTplError ? BUTTON_SAVE_TEMPLATE + '<br><br>' + adminDisplay.saveTplErrMsg : BUTTON_SAVE_TEMPLATE}</Text>
                      <HStack margin='0.5em 0'>
                        <Text>Name:</Text><Input ref={saveTemplateName} size='xs'></Input>
                      </HStack>
                      <VStack margin='0.5em 0' align='start'>
                        <Text>Description:</Text>
                        <Textarea ref={saveTemplateDesc} size='xs'/>
                      </VStack>
                      <HStack>
                        <Spacer/>
                        <Button size='xs' onClick={onClose}>Cancel</Button>
                        <Button size='xs' onClick={() => {doSaveTemplate(); onClose()}}>Save</Button>
                      </HStack>
                    </PopoverBody>
                  </PopoverContent>
                </Portal></>
              }}
            </Popover>
            {advancedMode ? [
              <ActionButton text='Update Template' onClick={onUpdateTemplate} buttonStyle={{ size: 'xs' }}
                tooltip={{ text: BUTTON_UPDATE_TEMPLATE_TOOLTIP, placement: 'left-start' }}
                errorFlag={adminDisplay.updateTemplateError} errorText={adminDisplay.updateTemplateErrMsg}
                isDisabled={(!authenticated || locked || adminDisplay.updatingTemplate) && !advancedMode}
                isLoading={adminDisplay.updatingTemplate} loadingText='Updating...'/>,
              <ActionButton text='Update Site Admin' onClick={onUpdateAdminUi} buttonStyle={{ size: 'xs' }}
                tooltip={{ text: BUTTON_UPDATE_UI_TOOLTIP, placement: 'left-start' }}
                errorFlag={adminDisplay.updateUiError} errorText={adminDisplay.updateUiErrMsg}
                isDisabled={(!authenticated || locked || adminDisplay.updatingUi) && !advancedMode}
                isLoading={adminDisplay.updatingUi} loadingText='Updating...'/>
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
        <PreparingTemplate adminTemplates={adminTemplates} adminConfig={adminConfig} />
      </Modal>

      <Modal isOpen={showSelectTemplate && ! showLogin}>
        <ModalOverlay />
        <SelectTemplate adminTemplates={adminTemplates} setTemplateId={setTemplateId} />
      </Modal>

      <Modal isOpen={showLogin}>
        <ModalOverlay/>
        <Login authState={authState} authErrorMsg={authErrorMsg} passwordChanging={passwordChanging} />
      </Modal>
    </ChakraProvider>
  )
}

/** Setup to get Admin state from the server */
function useAdminStatePolling(adminLive, setAdminState) {
  if ( ! adminStatePoller) {
    //console.log(`First admin state poll`)
    controller.checkState().then(async () => {
      //console.log(`First admin state`)
      setAdminState(controller.getConfig())
    })
    // Sneak in a call here to pre-load the list of available domains.
    controller.sendCommand('getAvailableDomains')
  }
  useEffect(() => {
    if ( ! adminStatePoller) {
      adminStatePoller = setInterval(async () => {
        //console.log(`In poll loop. Visible state: ${document.visibilityState}`)
        if (document.visibilityState !== "visible") {
          if (maxPollingLoopCount === 1) {
            endFastPolling()
          }
          return
        }
        if (pollLoopCount >= maxPollingLoopCount) {
          try {
            //console.log(`Scheduled admin state poll. Max loop count: ${maxPollingLoopCount}`)
            if (await controller.checkState() || !adminLive) {
              //console.log(`Admin state changed`)
              setAdminState(controller.getConfig())
            }
          } catch (error) {
            console.log('Failed to get state from server.', error)
            endFastPolling()
          } finally {
            pollLoopCount = 0
          }
        }
        ++pollLoopCount
      }, STATE_POLL_INTERVAL_MS)
    }
    return () => {
      clearInterval(adminStatePoller)
      adminStatePoller = null
    };
  }, [adminLive, setAdminState])
}

// Check lock state now, and every 4 minutes after
function useLockStatePolling(setLocked) {
  if ( ! lockStatePoller) {
    controller.getLockState().then(locked => { setLocked(locked) })
  }
  useEffect(() => {
    if ( ! lockStatePoller) {
      lockStatePoller = setInterval(async () => {
        if (document.visibilityState !== "visible") {
          return
        }
        setLocked(await controller.getLockState())
      }, 4 * 60 * 1000)
    }
    return () => {
      clearInterval(lockStatePoller)
      lockStatePoller = null
    }
  }, [setLocked])
}

// Periodically push updated content to the server
function usePutContentWorker(controller, adminConfig, contentToPut, putContentComplete, setUploadError) {
  useEffect(() => {
    if ( ! putContentWorker) {
      putContentWorker = setInterval(async () => {
        await Promise.all(Object.keys(contentToPut.current).map(async toPutId => {
          const toPut = contentToPut.current[toPutId]
          if (toPut.state === 'new') {
            toPut.state = 'working'
            const sourceRec = toPut.source[toPut.id]
            if (sourceRec) {
              console.log(`Push content to server for ${toPutId}`, sourceRec)
              try {
                if (sourceRec.isConfig) {
                  await controller.putSiteConfig(
                    adminConfig.templateId,
                    toPutId,
                    toPut.contentType || sourceRec.contentType,
                    sourceRec.content
                  )
                } else {
                  await controller.putSiteContent(
                    adminConfig.templateId,
                    toPutId,
                    toPut.contentType || sourceRec.contentType,
                    sourceRec.content
                  )
                }
                toPut.state = 'done'
                setUploadError(null)
                const update = Object.assign({}, putContentComplete.current)
                update[toPutId] = { succeeded: true }
                putContentComplete.current = update
              } catch (e) {
                console.error(`Upload failed for ${toPutId}`, toPut)
                toPut.state = 'failed'
                setUploadError(toPut.editorId)
                const update = Object.assign({}, putContentComplete.current)
                update[toPutId] = { succeeded: false }
                putContentComplete.current = update
              }
            }
          }
        }))
      }, 3 * 1000)
    }
    return () => {
      clearInterval(putContentWorker)
      putContentWorker = null
    }
  }, [adminConfig, contentToPut, controller, putContentComplete, setUploadError])
}

export default App
