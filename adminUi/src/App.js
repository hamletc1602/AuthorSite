import React, { useState, useRef, useEffect } from 'react'
import {
  ChakraProvider, extendTheme, Text, Button, Link, Flex, Spacer, Grid,GridItem, Tabs, TabList, TabPanels,
  Tab, TabPanel, Skeleton, Modal, ModalOverlay, Tooltip, Divider
} from '@chakra-ui/react'
import {
  InfoIcon, ExternalLinkIcon, InfoOutlineIcon
} from '@chakra-ui/icons'
import { mode } from '@chakra-ui/theme-tools'
import Controller from './Controller'
import Editor from './Editor'
import Login from './Login'
import SelectTemplate from './SelectTemplate'
import PreparingTemplate from './PreparingTemplate'
import deepEqual from 'deep-equal'
import Util from './Util'

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
})

// fill in site links from current URL host (Or from the environment, if we're in local dev. mode)
let siteHost = null
let testSiteHost = null
if (process.env.NODE_ENV !== 'development') {
  if (window.location.host.indexOf('test.') === 0) {
    testSiteHost = window.location.host
    siteHost = testSiteHost.substring(5)
  } else {
    siteHost = window.location.host
    if (siteHost) {
      siteHost = siteHost.replace('www.', '')
      testSiteHost = 'test.' + siteHost
    }
  }
} else {
  siteHost = process.env.REACT_APP_TARGET_HOST
  if (siteHost) {
    siteHost = siteHost.replace('www.', '')
    testSiteHost = 'test.' + siteHost
  }
}

//
const controller = new Controller()

// Text
const BUTTON_GENERATE_TOOLTIP = 'Generate a test site from your configuration.'
const BUTTON_PUBLISH_TOOLTIP = 'Replate your current live site content with the test site content.'

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

// Start refresh each STATE_POLL_INTERVAL_MS. Only if unlocked.
function startFastPolling() {
  maxPollingLoopCount = 1
  fastPollingTimeoutId = setTimeout(function() {
    endFastPolling()
    fastPollingTimeoutId = null
  }, FastPollingTimeoutMs)
}

/** Return to slow refresh */
function endFastPolling() {
  maxPollingLoopCount = 30
  if (fastPollingTimeoutId) {
    clearTimeout(fastPollingTimeoutId)
    fastPollingTimeoutId = null
  }
}

//
function App() {
  // State
  const [showLogin, setShowLogin] = useState(true)
  const [showSelectTemplate, setShowSelectTemplate] = useState(false)
  const [showPreparingTemplate, setShowPreparingTemplate] = useState(false)
  const [showGenerating, setShowGenerating] = useState(false)
  const [showPublishing, setShowPublishing] = useState(false)
  const [advancedMode, setAdvancedMode] = useState(false)
  const [adminLive, setAdminLive] = useState(false)
  const [adminConfig, setAdminConfig] = useState({ new: true })
  const [adminDisplay, setAdminDisplay] = useState({})
  const [adminTemplates, setAdminTemplates] = useState([])
  const [authState, setAuthState] = useState('unknown')
  const [authErrorMsg, setAuthErrorMsg] = useState('')
  const [locked, setLocked] = useState(false)
  const [editorsEnabled, setEditorsEnabled] = useState(false)
  const [path, setPath] = useState([])
  const [contentToGet, setContentToGet] = useState(null)
  const [putContentComplete, setPutContentComplete] = useState(null)

  // Calculated State
  const authenticated = authState === 'success'

  // Global Refs
  const editors = useRef([])
  const configs = useRef({})
  const prevEditorIndex = useRef(null)
  const contentToPut = useRef({})
  const fileContent = useRef({})
  const currTemplate = useRef({})

  // Indicate there's new content to put on this path
  const scheduleContentPush = (path, source, id) => {
    contentToPut.current[path] = {
      source: source,
      id: id,
      state: 'new'
    }
  }

  // Handlers
  const advancedModeClick = () => setAdvancedMode(!advancedMode)

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

  // const onSaveTemplate = () => {
  //   throw Error('NYI')
  // }

  const onGenerate = () => {
    controller.sendCommand('build', { id: adminConfig.templateId, debug: advancedMode })
    setShowGenerating(true)
    setTimeout(() => {
      console.log(`Cancel generating state after 15 minutes. Server-side generator timed out.`)
      setShowGenerating(false)
    }, 15 * 60 * 1000)
    startFastPolling()
  }

  const onPublish = () => {
    controller.sendCommand('publish')
    setShowPublishing(true)
    setTimeout(() => {
      console.log(`Cancel publishing state after 5 minutes. Server-side generator timed out.`)
      setShowPublishing(false)
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
    await Util.processDynamicProperties(configs.current, configs.current[configId], loadAndCacheConfig)
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
      setAdminDisplay(adminState.display)
      setAdminTemplates(adminState.templates)
      if (adminState.config.templateId) {
        currTemplate.current = adminState.templates.find(t => t.id === adminState.config.templateId)
      }
      setAdminLive(true)
    } else {
      if ( ! deepEqual(adminState.config, adminConfig)) {
        setAdminConfig(adminState.config)
      }
      if ( ! deepEqual(adminState.display, adminDisplay)) {
        setAdminDisplay(adminState.display)
        if ( ! adminState.display.deploying) {
          setShowPublishing(false)
        }
        if ( ! adminState.display.building) {
          setShowGenerating(false)
        }
      }
      if ( ! deepEqual(adminState.templates, adminTemplates)) {
        setAdminTemplates(adminState.templates)
      }
    }
  }

  //
  useAdminStatePolling(adminLive, setAdminState)
  useLockStatePolling(setLocked)
  usePutContentWorker(controller, adminConfig, contentToPut, setPutContentComplete)

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
                editorsData = editorsData.map(editor => {
                  editor.lastEditPath = [{ name: editor.id }]
                  return editor
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
    if (contentToGet) {
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

  // Disable show generating when generating is complete
  useEffect(() => {
    if ( ! adminDisplay.preparing) {
      setShowPreparingTemplate(false)
    }
  }, [adminDisplay.preparing, setShowPreparingTemplate])

  // Disable show generating when generating is complete
  useEffect(() => {
    if ( ! adminDisplay.building) {
      setShowGenerating(false)
    }
  }, [adminDisplay.building, setShowGenerating])

  // Disable show publishing when publishing is complete
  useEffect(() => {
    if ( ! adminDisplay.deploying) {
      setShowPublishing(false)
    }
  }, [adminDisplay.deploying, setShowPublishing])

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
            <InfoIcon color='accentText' m='5px'/>
            <Text color='accentText' m='2px'>Site Admin</Text>
            <Text color='danger' m='2px' hidden={!locked}>(Read Only)</Text>
            <Spacer/>
            {advancedMode ? [
              <Divider orientation='vertical' />,
              <Text color='accentText' m='2px 5px' >Template:</Text>,
              // <Button
              //   size='sm' m='3px' onClick={onSaveTemplate}
              //   disabled={!authenticated || locked}
              //   color='accent' _hover={{ bg: 'gray.400' }}
              // >Save</Button>,
              <Button
                size='sm' m='0 0.5em' onClick={onLoadTemplate}
                disabled={!authenticated || locked}
                color='accent' _hover={{ bg: 'gray.400' }}
              >Load</Button>,
              <Divider orientation='vertical' />,
              ]
            : null}
            <Tooltip
              openDelay={650} closeDelay={250} hasArrow={true} placement='left-end'
              label={adminDisplay.buildError ? adminDisplay.buildErrMsg : BUTTON_GENERATE_TOOLTIP}
              aria-label={adminDisplay.buildError ? adminDisplay.buildErrMsg : BUTTON_GENERATE_TOOLTIP}
            >
              <Button
                size='sm' m='0 0.5em' onClick={onGenerate}
                disabled={(!authenticated || locked || showGenerating || adminDisplay.building) && !advancedMode}
                isLoading={(showGenerating || adminDisplay.building) && !advancedMode} loadingText='Generating...'
                color='accent' _hover={{ bg: 'gray.400' }} bg={adminDisplay.buildError ? 'danger' : 'accentText'}
              >Generate</Button>
            </Tooltip>
            {advancedMode ?
              <Button
                size='sm' m='0 0.5em' onClick={onGenerate}
                disabled={(!authenticated || locked || showGenerating || adminDisplay.building) && !advancedMode}
                isLoading={(showGenerating || adminDisplay.building) && !advancedMode} loadingText='Generating Debug...'
                color='accent' _hover={{ bg: 'gray.400' }} bg={adminDisplay.buildError ? 'danger' : 'accentText'}
              >Generate Debug</Button>
            : null}
            <Link href={`https://${testSiteHost}/`} size='sm' color='accentText' isExternal>Test Site <ExternalLinkIcon mx='2px'/></Link>
            <Tooltip
              openDelay={650} closeDelay={250} hasArrow={true} placement='left-end'
              label={adminDisplay.prepareError ? adminDisplay.prepareErrMsg : BUTTON_PUBLISH_TOOLTIP}
              aria-label={adminDisplay.prepareError ? adminDisplay.prepareErrMsg : BUTTON_PUBLISH_TOOLTIP}
            >
              <Button
                size='sm' m='0 0.5em' onClick={onPublish}
                disabled={(!authenticated || locked || showPublishing || adminDisplay.deploying) && !advancedMode}
                isLoading={(showPublishing || adminDisplay.deploying) && !advancedMode} loadingText='Publishing...'
                color='accent' _hover={{ bg: 'gray.400' }} bg={adminDisplay.prepareError ? 'danger' : 'accentText'}
              >Publish</Button>
            </Tooltip>
            <Link href={`https://${siteHost}/`} size='sm' color='accentText' isExternal>Site <ExternalLinkIcon mx='2px'/></Link>
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
                {editors.current.map((editor) => (
                  <Tab color='accentText' _selected={{ color: 'gray.400' }} _hover={{ color: 'gray.400' }}
                    key={editor.id} disabled={!authenticated}
                  >{editor.title}</Tab>
                ))}
              </TabList>
              <TabPanels bg='editorBg' maxHeight='calc(100vh - 6.25em)' overflowY='auto'>
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
        <GridItem h='1.6em' bg='accent'>
          <Flex p='3px 5px'>
              <Text fontSize='xs' m='2px 5px 0 0' color='accentText'>Copyright BraeVitae 2022</Text>
              <InfoOutlineIcon m='3px' color={advancedMode ? 'accentActiveText' : 'accentText'} onClick={advancedModeClick}/>
          </Flex>
        </GridItem>
      </Grid>

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
    console.log(`First admin state poll`)
    controller.checkState().then(async () => {
      console.log(`First admin state`)
      setAdminState(controller.getConfig())
    })
  }
  useEffect(() => {
    if ( ! adminStatePoller) {
      adminStatePoller = setInterval(async () => {
        if (pollLoopCount >= maxPollingLoopCount) {
          try {
            console.log(`Scheduled admin state poll`)
            if (await controller.checkState() || !adminLive) {
              console.log(`Admin state changed`)
              setAdminState(controller.getConfig())
            }
            if ( ! controller.isBusy()) {
              endFastPolling()
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
function usePutContentWorker(controller, adminConfig, contentToPut, setPutContentComplete) {
  useEffect(() => {
    if ( ! putContentWorker) {
      putContentWorker = setInterval(async () => {
        await Promise.all(Object.keys(contentToPut.current).map(async toPutId => {
          const toPut = contentToPut.current[toPutId]
          if (toPut.state === 'new') {
            console.log(`Push content to server for ${toPutId}`)
            toPut.state = 'working'
            const sourceRec = toPut.source[toPut.id]
            if (sourceRec) {
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
                // HACK: The Image editor is the only component that needs to change in response to the
                // putContent complete (at least for now), so only chnage this for non-text content, so
                // it does not push a re-render of the text editor and cause it to lose focus.
                if (sourceRec.contentType !== 'text/plain') {
                  setPutContentComplete(toPutId)
                }
              }
              toPut.state = 'done'
            }
          }
        }))
      }, 3 * 1000)
    }
    return () => {
      clearInterval(putContentWorker)
      putContentWorker = null
    }
  }, [adminConfig, contentToPut, controller, setPutContentComplete])
}

export default App
