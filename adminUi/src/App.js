import React, { useState, useRef } from 'react'
import {
  ChakraProvider, extendTheme,
  Text, Input, Button, Link, Select,
  InputGroup, InputRightElement,
  Flex, Spacer,
  Grid,GridItem,
  Tabs, TabList, TabPanels, Tab, TabPanel,
  Spinner, Skeleton
} from '@chakra-ui/react'
import {
  InfoIcon, CheckIcon, NotAllowedIcon, ViewIcon, ViewOffIcon, QuestionOutlineIcon,
  ExternalLinkIcon, InfoOutlineIcon
} from '@chakra-ui/icons'
//import { mode } from '@chakra-ui/theme-tools'
import Controller from './Controller';
import Editor from './Editor'
import deepEqual from 'deep-equal'

// Theme
// Will likely need a full style config, like here: https://chakra-ui.com/docs/components/tabs/theming
const customTheme = extendTheme({
  initialColorMode: 'light',
  useSystemColorMode: true,
  colors: {
    brand: {
      base: {
        default: 'grey.300',
        _dark: 'grey.700'
      },
      baseText: {
        default: 'black',
        _dark: 'white'
      },
      disabledBaseText: {
        default: 'gray.600',
        _dark: 'gray.800'
      },
      accent: 'blue',
      accentText: 'white',
      accentActiveText: 'orange',
      editor: {
        default: 'white',
        _dark: 'black'
      },
      editorText: {
        default: 'black',
        _dark: 'white'
      },
      editorBgHack: 'white',
      editorDivider: {
        default: 'gray.300',
        _dark: 'gray.600'
      },
      listSelected: 'gray.200',
      listNew: 'blue.100'
    }
  },
  semanticTokens: {
    colors: {
    },
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
    testSiteHost = 'test.' + siteHost
  }
} else {
  siteHost = process.env.REACT_APP_TARGET_HOST
  testSiteHost = 'test.' + siteHost
}

//
const controller = new Controller()

// Drive controller logic at a rate set by the UI:
// Check state as needed (variable rate)
let adminStatePoller = null
let lockStatePoller = null
let putContentWorker = null
const FastPollingTimeoutMs = 5 * 60 * 1000
let fastPollingTimeoutId = null
let maxPollingLoopCount = 30 // Default 30s updates
let pollLoopCount = 0
let passwordChangingDebounce = null

// Start refresh each second. Only if unlocked.
function startFastPolling() {
  maxPollingLoopCount = 1
  fastPollingTimeoutId = setTimeout(function() {
    endFastPolling()
    fastPollingTimeoutId = null
  }, FastPollingTimeoutMs)
}

/** Return to refresh each 30 seconds */
function endFastPolling() {
  maxPollingLoopCount = 30
  if (fastPollingTimeoutId) {
    clearTimeout(fastPollingTimeoutId)
    fastPollingTimeoutId = null
  }
}

const authStates = {
  unknown: {
    icon: <QuestionOutlineIcon m='6px 2px 2px 2px' color='red.600'/>
  },
  pending: {
    icon: <Spinner size="xs" m='6px 2px 2px 2px'/>
  },
  success: {
    icon: <CheckIcon m='6px 2px 2px 2px' color='green.300'/>
  },
  fail: {
    icon: <NotAllowedIcon m='6px 2px 2px 2px' color='red.300'/>
  }
}

//
function App() {
  // State
  const [generateDebug, setGenerateDebug] = useState(false)
  const [adminLive, setAdminLive] = useState(false)
  const [adminConfig, setAdminConfig] = useState({})
  const [adminDisplay, setAdminDisplay] = useState({})
  const [adminLog, setAdminLog] = useState([])
  const [adminTemplates, setAdminTemplates] = useState([])
  const [showPwd, setShowPwd] = useState(false)
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

  // Indicate there's new content to put on this path
  const scheduleContentPush = (path, source, id) => {
    source = source || fileContent.current
    id = id || path
    contentToPut.current[path] = {
      source: source,
      id: id,
      state: 'new'
    }
  }

  // Handlers
  const viewPwdClick = () => {
    if ( ! showPwd) { // Pwd currently hidden, will be shown
      // Re-hide the password after 10s
      setTimeout(() => {
        setShowPwd(false)
      }, 10000)
    }
    setShowPwd(!showPwd)
  }
  const generateDebugClick = () => setGenerateDebug(!generateDebug)
  const onTemplateIdChange = (ev) => {
    const templateId = ev.target.value
    controller.sendCommand('config', { templateId: templateId })
    const newConfig = Object.assign({}, adminConfig)
    newConfig.templateId = templateId
    setAdminConfig(newConfig)
    // On template change, destroy and re-buld the editor panels to the state of the new template
    // Or - Keep duplicate (hidden) edit panels around?
    // Switching templates back and forth is unlikely to be a common action for prod sites (Since
    // you'd need to re-buld the site each time to see the results.)
  }
  const onPrepare = () => {
    controller.sendCommand('template', { id: adminConfig.templateId })
    startFastPolling()
    // TODO: When prepare is run for a different template than the current one, need to clear all existing
    // editor components and re-build them with the config layout (and data) of the new template.
  }
  const onGenerate = () => {
    controller.sendCommand('build', { id: adminConfig.templateId, debug: generateDebug })
    startFastPolling()
  }
  const onPublish = () => {
    controller.sendCommand('publish')
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
      configs.current[configId] = raw.content
    }
    setPath(editor.lastEditPath)
    prevEditorIndex.current = index
  }

  // Dynamic Content
  const latestLogUpdate = () => {
    if (adminLog.length > 0) {
      return <Text size='xs' whiteSpace='nowrap' noOfLines={1}>{adminDisplay.stepMsg}: {adminLog[0].msg}</Text>
    } else {
      return <Text size='xs' whiteSpace='nowrap' noOfLines={1} color='brand.disabledBaseText'>No log messages yet...</Text>
    }
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
          setContentToGet({ path: path })
        }}
        pushContent={scheduleContentPush}
      />
    }
    return null
  }

  // Server State Polling
  // TODO: investigate this package: https://www.npmjs.com/package/use-remote-data
  //  for handling server data access. Builds in refresh logic and integration with React state.

  // Invoke when admin state polling determines something in the state has changed (new state from server)
  const setAdminState = (adminState) => {
    if ( ! adminLive) {
      setAdminConfig(adminState.config)
      setAdminDisplay(adminState.display)
      setAdminLog(adminState.logs)
      setAdminTemplates(adminState.templates)
      setAdminLive(true)
    } else {
      if ( ! deepEqual(adminState.config, adminConfig)) {
        setAdminConfig(adminState.config)
      }
      if ( ! deepEqual(adminState.display, adminDisplay)) {
        setAdminDisplay(adminState.display)
      }
      if ( ! deepEqual(adminState.logs, adminLog)) {
        setAdminLog(adminState.logs)
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
  React.useEffect(() => {
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
                // Hack: Workaroud general schema missing type & properties, for now:
                if (raw.content.schema && !raw.content.schema.properties) {
                  raw.content.schema = {
                    type: 'object',
                    properties: raw.content.schema
                  }
                }
                raw.content.contentType = 'application/json' // Hard code content-type for now, since server is not returning it yet
                configs.current[editorId] = raw.content
                editors.current = editorsData
                setPath([{ name: editorId }])
                setEditorsEnabled(true)
              }
            })
        }
      }
    } catch (error) {
      console.error('Failed Get editors init.', error)
    }
  }, [adminConfig, uiEnabled])

  // Get content data from the server on start editing
  React.useEffect(() => {
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
          toGet.content = contentRec.content
          toGet.contentType = contentRec.contentType
          toGet.state = 'complete'
        })
        .catch(error => {
          setContentToGet(null)
          toGet.state = 'failed'
        })
      }
    }
  },[adminConfig, contentToGet])

  // UI
  return (
    <ChakraProvider theme={customTheme}>
      <Grid
        h='calc(100vh - 1em)'
        templateAreas={`
          "header header, header"
          "prepare generate publish"
          "status status status"
          "edit edit edit"
          "footer footer footer"
        `}
        templateRows={'2em 2em 1.5em 1fr 1em'}
        templateColumns={'17em 13em 1fr'}
      >
        <GridItem colSpan={3} color='brand.base' bg='brand.accent'>
          <Flex>
            <InfoIcon color='brand.accentText' m='5px'/>
            <Text color='brand.accentText' m='2px'>Site Admin</Text>
            <Spacer/>
            {authStates[authState].icon}
            <InputGroup w='10em' size='xs' m='2px'>
              <Input
                type={showPwd ? 'text' : 'password'}
                color='brand.accentText'
                placeholder='Password...'
                onChangeCapture={passwordChanging}
              />
              <InputRightElement color='brand.accentText' onClick={viewPwdClick}>
                {showPwd ? <ViewOffIcon/> : <ViewIcon/>}
              </InputRightElement>
            </InputGroup>
          </Flex>
        </GridItem>
        <GridItem bg='brand.base'>
          <Flex>
            <Select
              variant='flushed' size='sm' w='10em' m='3px'
              placeholder='Select a template...'
              value={adminConfig.templateId}
              onChange={onTemplateIdChange}
              disabled={!uiEnabled}
            >
              {adminTemplates.map(tpl => {
                return <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              })}
            </Select>
            <Button size='sm' m='3px' onClick={onPrepare} disabled={!uiEnabled}>{editorsEnabled ? 'Re-Init' : 'Init'}</Button>
          </Flex>
        </GridItem>
        <GridItem bg='brand.base'>
          <Flex>
            <Button size='sm' m='3px' onClick={onGenerate} disabled={!uiEnabled}>
              {generateDebug ? 'Generate Debug' : 'Generate'}
            </Button>
            <Link href={`https://${testSiteHost}/`} size='sm' isExternal>Test Site <ExternalLinkIcon mx='2px'/></Link>
          </Flex>
        </GridItem>
        <GridItem bg='brand.base'>
          <Flex>
            <Button size='sm' m='3px' onClick={onPublish} disabled={!uiEnabled}>Publish</Button>
            <Link href={`https://${siteHost}/`} size='sm' isExternal>Site <ExternalLinkIcon mx='2px'/></Link>
          </Flex>
        </GridItem>
        <GridItem colSpan={3}>
          {latestLogUpdate()}
        </GridItem>
        <GridItem
          colSpan={3}
          bg='brand.accent'
        >
          <Skeleton isLoaded={editorsEnabled}>
            <Tabs size='sm' isManual isLazy lazyBehavior='keepMounted' onChange={editorTabChange}>
              <TabList>
                {editors.current.map((editor) => (
                  <Tab color='white' key={editor.id} disabled={!uiEnabled}>{editor.title}</Tab>
                ))}
              </TabList>
              <TabPanels bg='brand.base'>
                {editors.current.map((editor) => (
                  <TabPanel p='0' key={'Tab_' + editor.id}>
                    <Skeleton isLoaded={configs.current[editor.id]}>
                      <EditorTab key={'EditorTab_' + editor.id} editor={editor} />
                    </Skeleton>
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          </Skeleton>
        </GridItem>
        <GridItem h='1.55em' colSpan={3} bg='brand.accent'>
          <Flex>
              <Text fontSize='xs' m='2px 5px' color='brand.accentText'>Copyright BraeVitae 2022</Text>
              <InfoOutlineIcon m='3px' color={generateDebug ? 'brand.accentActiveText' : 'brand.accentText'} onClick={generateDebugClick}/>
          </Flex>
        </GridItem>
      </Grid>
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
  React.useEffect(() => {
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
      }, 1000)
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
  React.useEffect(() => {
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
  React.useEffect(() => {
    if ( ! putContentWorker) {
      putContentWorker = setInterval(async () => {
        await Promise.all(Object.keys(contentToPut.current).map(async toPutId => {
          const toPut = contentToPut.current[toPutId]
          if (toPut.state === 'new') {
            console.log(`Push content to server for ${toPutId}`)
            toPut.state = 'working'
            const sourceRec = toPut.source[toPut.id]
            if (sourceRec) {
              await controller.putSiteContent(
                adminConfig.templateId,
                toPutId,
                toPut.contentType || sourceRec.contentType,
                sourceRec.content
              )
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
