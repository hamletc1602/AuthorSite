import React, { useState, useRef, useEffect } from 'react'
import {
  ChakraProvider, extendTheme, Text, Button, Link, Flex, Spacer, Grid,GridItem, Tabs, TabList, TabPanels,
  Tab, TabPanel, Skeleton, Modal, ModalOverlay
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

// Theme
const props = { colorMode: 'light' } // Hack so 'mode' func will work. Need to actually get props with color mode from the framework, but defining colors as a func does not work??
const customTheme = extendTheme({
  initialColorMode: props.colorMode,
  useSystemColorMode: true,
  semanticTokens: {
    colors: {
      base: mode('gray.300', 'gray.700')(props),
      baseText: mode('black', 'white')(props),
      disabledBaseText: mode('gray.600', 'gray.800')(props),
      accent: mode('blue', 'blue')(props),
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
    siteHost = testSiteHost.substring(4)
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
  const [adminConfig, setAdminConfig] = useState({})
  const [adminDisplay, setAdminDisplay] = useState({})
  const [adminTemplates, setAdminTemplates] = useState([])
  const [authState, setAuthState] = useState('unknown')
  const [locked, setLocked] = useState(false)
  const [editorsEnabled, setEditorsEnabled] = useState(false)
  const [path, setPath] = useState([])
  const [contentToGet, setContentToGet] = useState(null)

  // Calculated State
  const uiEnabled = !locked && authState === 'success'

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
      setShowPreparingTemplate(true)
      setShowSelectTemplate(false)
    }
  }

  const onGenerate = () => {
    controller.sendCommand('build', { id: adminConfig.templateId, debug: advancedMode })
    setShowGenerating(true)
    startFastPolling()
  }

  const onPublish = () => {
    controller.sendCommand('publish')
    setShowPublishing(true)
    startFastPolling()
  }

  // On a .5 second debounce, check if the current entered password is valid, and set the auth state occordingly.
  const passwordChanging = (ev) => {
    clearTimeout(passwordChangingDebounce)
    passwordChangingDebounce = setTimeout(async () => {
      const currPwd = ev.target.value
      if (currPwd.length > 0) {
        setAuthState('pending')
        try {
          if (await controller.validatePassword(currPwd)) {
            setAuthState('success')
            controller.setPassword(currPwd)
          } else {
            setAuthState('fail')
          }
        } catch (error) {
          console.error('Unable to authenticate with server.', error)
          setAuthState('unknown')
        }
      }
    }, 500)
  }

  // On Editor tab change, pull the config file for this tab, if we haven't already cached it
  // and set the current edit item path to the last saved ath for this editor.
  const editorTabChange = async (index) => {
    //
    const prevEditor = editors.current[prevEditorIndex.current]
    if (prevEditor) {
      prevEditor.lastEditPath = [...path]
    }
    //
    const editor = editors.current[index]
    const configId = editor.id
    if ( ! configs.current[configId]) {
      const raw = await controller.getSiteConfig(adminConfig.templateId, configId)
      raw.content.contentType = 'application/json' // Hard code content-type for now, since server is not returning it yet
      raw.content.isConfig = true // Add config flag, for use later in uploading.
      configs.current[configId] = raw.content
    }
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
        advancedMode={advancedMode}
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
      }
      if ( ! deepEqual(adminState.templates, adminTemplates)) {
        setAdminTemplates(adminState.templates)
      }
    }
  }

  //
  useAdminStatePolling(adminLive, setAdminState)
  useLockStatePolling(setLocked)
  usePutContentWorker(controller, adminConfig, contentToPut)

  // Get config data from the server
  useEffect(() => {
    try {
      if (uiEnabled && editors.current.length === 0) {
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
                raw.content.contentType = 'application/json' // Hard code content-type for now, since server is not returning it yet
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
  }, [adminConfig, uiEnabled])

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
          }
        })
        .catch(error => {
          setContentToGet(null)
          toGet.state = 'failed'
        })
      }
    }
  },[adminConfig, contentToGet])

  // Hide login dialog on auth success, but delay for a couple of seconds so it's not so jarring to the user.
  useEffect(() => {
    if (authState === 'success') {
      setTimeout(() => {
        setShowLogin(false)
        if ( ! adminConfig.templateId) {
          setShowSelectTemplate(true)
        }
      }, 2000)
    }
  }, [authState, setShowLogin, adminConfig.templateId, setShowSelectTemplate])

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
        h='calc(100vh - 1em)'
        templateAreas={`
          "header"
          "build"
          "edit"
          "footer"
        `}
        templateRows={'2.5em 1fr 1em'}
        templateColumns={'1fr'}
      >
        <GridItem color='baseText' bg='accent'>
          <Flex p='0 1em 0 0'>
            <InfoIcon color='accentText' m='5px'/>
            <Text color='accentText' m='2px'>Site Admin</Text>
            <Spacer/>
            <Button
              size='sm' m='3px' onClick={onGenerate} disabled={!uiEnabled || showGenerating || adminDisplay.building}
              isLoading={showGenerating || adminDisplay.building} loadingText='Generating...'
              margin='0 0.5em 0 0.5em'
            >Generate</Button>
            {advancedMode ?
              <Button
                size='sm' m='3px' onClick={onGenerate} disabled={!uiEnabled || showGenerating || adminDisplay.building}
                isLoading={showGenerating || adminDisplay.building} loadingText='Generating Debug...'
              >Generate Debug</Button>
            : null}
            <Link href={`https://${testSiteHost}/`} size='sm' color='accentText' isExternal>Test Site <ExternalLinkIcon mx='2px'/></Link>
            <Button
              size='sm' m='3px' onClick={onPublish} disabled={!uiEnabled || showPublishing || adminDisplay.deploying}
              isLoading={showPublishing || adminDisplay.deploying} loadingText='Publishing...'
              margin='0 0.5em 0 0.5em'
            >Publish</Button>
            <Link href={`https://${siteHost}/`} size='sm' color='accentText' isExternal>Site <ExternalLinkIcon mx='2px'/></Link>
          </Flex>
        </GridItem>
        <GridItem bg='accent' >
          <Skeleton
            isLoaded={editorsEnabled}
            hidden={showLogin || showSelectTemplate || showPreparingTemplate}
            height='100%'
          >
            <Tabs size='sm' isManual isLazy lazyBehavior='keepMounted' onChange={editorTabChange}>
              <TabList>
                {editors.current.map((editor) => (
                  <Tab color='accentText' key={editor.id} disabled={!uiEnabled}>{editor.title}</Tab>
                ))}
              </TabList>
              <TabPanels bg='base'>
                {editors.current.map((editor) => (
                  <TabPanel p='0' key={'Tab_' + editor.id}>
                    <Skeleton isLoaded={configs.current[editor.id]} hidden={configs.current[editor.id]} height='10em'/>
                    <EditorTab key={'EditorTab_' + editor.id} editor={editor} />
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          </Skeleton>
        </GridItem>
        <GridItem h='1.55em' bg='accent'>
          <Flex>
              <Text fontSize='xs' m='2px 5px' color='accentText'>Copyright BraeVitae 2022</Text>
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
        <Login authState={authState} passwordChanging={passwordChanging} />
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
function usePutContentWorker(controller, adminConfig, contentToPut) {
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
  }, [adminConfig, contentToPut, controller])
}

export default App
