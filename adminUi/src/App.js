import React from 'react'
import {
  ChakraProvider, extendTheme,
  Text, Input, Button, Link, Select, Box,
  InputGroup, InputRightElement,
  Flex, Spacer,
  Grid,GridItem,
  Tabs, TabList, TabPanels, Tab, TabPanel,
  Spinner,
  Skeleton
} from '@chakra-ui/react'
import {
  InfoIcon, CheckIcon, NotAllowedIcon, ViewIcon, ViewOffIcon, QuestionOutlineIcon,
  ExternalLinkIcon, InfoOutlineIcon
} from '@chakra-ui/icons'
//import { mode } from '@chakra-ui/theme-tools'
import Controller from './Controller';
import Editor from './Editor'
import EditorValue from './EditorValue'

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

// Update the specific config value at the given item path and name, with the given value.
function setConfig(config, itemPath, name, value) {
  for (let i = 0; i < itemPath.length; ++i) {
    const path = itemPath[i]
    config = config[path]
  }
  if (config) {
    config[name] = value
  } else {
    console.error(`Item path ${itemPath} does not match config`, config)
  }
}

function EditorTab({editor, configs, setConfigs, editItems, setEditItems}) {
  const config = configs[editor.id]
  if (config) {
    return <Editor
      editor={editor}
      config={{content: config.content, schema: config.schema, path: []}}
      setConfig={(itemPath, name, newValue) => {
        const copy = Object.assign({}, configs)
        setConfig(copy[editor.id].content, itemPath, name, newValue)
        setConfigs(copy)
      }}
      setEditItem={(item) => {
        const copy = Object.assign({}, editItems)
        copy[editor.id] = item
        setEditItems(copy)
      }}
    />
  }
  return null
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
  const [generateDebug, setGenerateDebug] = React.useState(false)
  const [adminState, setAdminState] = React.useState({
    live: false, config: {}, display: {}, latest: [], editors: [], templates: []
  })
  const [showPwd, setShowPwd] = React.useState(false)
  const [authState, setAuthState] = React.useState('unknown')
  const [locked, setLocked] = React.useState(false)
  // TODO: Have local send command and state update update the 'busy' state
  //  Add UI to show when the app is busy with a command - maybe need to know
  // which command?
  const [busy, setBusy] = React.useState(false)
  const [editors, setEditors] = React.useState([])
  const [configs, setConfigs] = React.useState({})
  const [editItems, setEditItems] = React.useState({})
  const [fileContent, setFileContent] = React.useState({})

  // Calculated State
  const uiEnabled = !locked && authState === 'success'
  const editorsEnabled = editors.length > 0

  // Handlers
  const viewPwdClick = () => setShowPwd(!showPwd)
  const generateDebugClick = () => setGenerateDebug(!generateDebug)
  const onTemplateIdChange = (ev) => {
    const templateId = ev.target.value
    controller.sendCommand('config', { templateId: templateId })
    const newState = Object.assign({}, adminState)
    newState.config.templateId = templateId
    setAdminState(newState)
    // On template change, destroy and re-buld the editor panels to the state of the new template
    // Or - Keep duplicate (hidden) edit panels around?
    // Switching templates back and forth is unlikely to be a common action for prod sites (Since
    // you'd need to re-buld the site each time to see the results.)
  }
  const onPrepare = () => {
    controller.sendCommand('template', { id: adminState.config.templateId })
    startFastPolling()
    // TODO: When prepare is run for a different template than the current one, need to clear all existing
    // editor components and re-build them with the config layout (and data) of the new template.
  }
  const onGenerate = () => {
    controller.sendCommand('build', { id: adminState.config.templateId, debug: generateDebug })
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
  const editorTabChange = async (index) => {
    const configId = editors[index].id
    if ( ! configs[configId]) {
      const configsCopy = Object.assign({}, configs)
      const raw = await controller.getSiteConfig(adminState.config.templateId, configId)
      configsCopy[configId] = raw.content
      setConfigs(configsCopy)
    }
  }

  // Dynamic Content
  const latestLogUpdate = () => {
    if (adminState.latest.length > 0) {
      return <Text size='xs' whiteSpace='nowrap' noOfLines={1}>{adminState.display.stepMsg}: {adminState.latest[0].msg}</Text>
    } else {
      return <Text size='xs' whiteSpace='nowrap' noOfLines={1} color='brand.disabledBaseText'>No log messages yet...</Text>
    }
  }

  // Server State Polling
  // TODO: Definitely investigate this package: https://www.npmjs.com/package/use-remote-data
  //  for handling server data access. Builds in refresh logic and integration with React state.
  useAdminStatePolling(adminState, setAdminState, setEditors)
  useLockStatePolling(setLocked)
  React.useEffect(() => {
    try {
      if (uiEnabled && editors.length === 0) {
        // If a template ID is saved in the admin state, also pull the list of editors from the server
        if (adminState.config.templateId) {
           controller.getEditors(adminState.config.templateId)
            .then(async editorsData => {
              if (editorsData) {
                const configs = {}
                const editorId = editorsData[0].id
                const raw = await controller.getSiteConfig(adminState.config.templateId, editorId)
                configs[editorId] = raw.content
                setConfigs(configs)
                setEditors(editorsData)
              }
            })
        }
      }
    } catch (error) {
      console.error('Failed Get editors init.', error)
    }
  }, [uiEnabled])

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
              value={adminState.config.templateId}
              onChange={onTemplateIdChange}
              disabled={!uiEnabled}
            >
              {adminState.templates.map(tpl => {
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
                {editors.map((editor) => (
                  <Tab color='white' key={editor.id} disabled={!uiEnabled}>{editor.title}</Tab>
                ))}
              </TabList>
              <TabPanels bg='brand.base'>
                {editors.map((editor) => (
                  <TabPanel p='0' key={editor.id}>
                    <Flex w='100%' direction='row'>
                      <Box w='70%'>
                        <EditorTab
                          editor={editor}
                          configs={configs}
                          setConfigs={setConfigs}
                          editItems={editItems}
                          setEditItems={setEditItems}
                        />
                      </Box>
                      <Box w='30%' minW='15em'>
                        <EditorValue
                          editor={editor}
                          setConfig={(itemPath, name, newValue) => {
                            const copy = Object.assign({}, configs)
                            setConfig(copy[editor.id].content, itemPath, name, newValue)
                            setConfigs(copy)
                          }}
                          item={editItems[editor.id]}
                          fileContent={fileContent}
                          setFileContent={(path, value) => {
                            const copy = Object.assign({}, fileContent)
                            copy[path] = value
                            setFileContent(copy)
                          }}
                        />
                      </Box>
                    </Flex>
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
function useAdminStatePolling(adminState, setAdminState, setEditors) {
  if ( ! adminStatePoller) {
    controller.checkState().then(async () => {
      // Set inital state, whether it's changed or not
      const state = controller.getConfig()
      setAdminState(state)
    })
  }
  React.useEffect(() => {
    if ( ! adminStatePoller) {
      adminStatePoller = setInterval(async () => {
        if (pollLoopCount >= maxPollingLoopCount) {
          try {
            if (await controller.checkState() || !adminState.live) {
              // There is new state available. Trigger UI refresh
              const newState = Object.assign({}, controller.getConfig(), { live: true })
              setAdminState(newState)
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
  }, [])
}

// Check lock state now, and every 4 minutes after
//    ( CORS is not enabled for lock state path, so turn this off in the client in dev. mode, for now )
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
  }, [])
}

export default App;
