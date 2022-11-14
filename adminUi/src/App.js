import React from 'react';
import {
  ChakraProvider, extendTheme,
  Text, Input, Button, Link, Textarea, Select,
  InputGroup, InputRightElement,
  Flex, Spacer,
  Grid,GridItem,
  Tabs, TabList, TabPanels, Tab, TabPanel,
  Spinner,
  Skeleton
} from '@chakra-ui/react';
import {
  InfoIcon, CheckIcon, NotAllowedIcon, ViewIcon, ViewOffIcon, QuestionOutlineIcon,
  ExternalLinkIcon, InfoOutlineIcon
} from '@chakra-ui/icons'
import { mode } from '@chakra-ui/theme-tools'
import Controller from './Controller';

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
    }
  },
  semanticTokens: {
    colors: {
    },
  },
})

const templates = [
  <option key='1' value='author'>Author</option>,
  <option key='2' value='artist'>Artist</option>
]

function createEditor(index, editor) {
  return <Textarea
    name={`editor${index}`}
    variant='flushed'
    color='brand.editorText'
    bg='brand.editor'
    h='calc(100vh - 9em)'
    resize='none'
    p='5px'
  />
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
const controller = new Controller(siteHost)

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

//
function App() {
  // State
  const [adminState, setAdminState] = React.useState({
      live: false,
      config: {},
      display: {},
      latest: [],
      editors: []
    })
  const [showPwd, setShowPwd] = React.useState(false)
  const [authState, setAuthState] = React.useState('unknown')
  const [locked, setLocked] = React.useState(false)
  const [generateDebug, setGenerateDebug] = React.useState(false)
  const [editors, setEditors] = React.useState([])

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
  }
  const onPrepare = () => {
    controller.sendCommand('template', { id: adminState.config.templateId })
    startFastPolling()
  }
  const onGenerate = () => {
    controller.sendCommand('build', { id: adminState.config.templateId, debug: generateDebug })
    startFastPolling()
  }
  const onPublish = () => {
    controller.sendCommand('publish')
    startFastPolling()
  }
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
  useAdminStatePolling(adminState, setAdminState)
  useLockStatePolling(setLocked)
  React.useEffect(async () => {
    if (adminState && adminState.config) {
      const templateId = adminState.config.templateId
      if (uiEnabled && templateId) {
        const tmp = await controller.getEditors(templateId)
        console.log('Editors config: ', tmp)
        setEditors(tmp)
      }
    }
  //}, [uiEnabled, adminState]) // Including adminState here appears to cause a crash on page load???
  }, [uiEnabled]) // Page loads, but there's a crash later, after authenticating.

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
            <InputGroup w='15em' size='xs' m='2px'>
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
              {templates}
            </Select>
            <Button size='sm' m='3px' onClick={onPrepare} disabled={!uiEnabled}>Prepare</Button>
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
            <Tabs size='sm' isLazy lazyBehavior='keepMounted'>
              <TabList>
                {editors.map((editor, index) => (
                  <Tab color='white' key={index} disabled={!uiEnabled}>{editor.title}</Tab>
                ))}
              </TabList>
              <TabPanels bg='brand.base'>
                {editors.map((editor, index) => (
                  <TabPanel p='0' key={index}>
                    {createEditor(index, editor)}
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
function useAdminStatePolling(adminState, setAdminState) {
  if ( ! adminStatePoller) {
    controller.checkState().then(() => {
      // Set inital state, whether it's changed or not
      setAdminState(controller.getConfig())
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
    if (process.env.NODE_ENV !== 'development') {
      controller.getLockState().then(locked => { setLocked(locked) })
    }
  }
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'development') {
      if ( ! lockStatePoller) {
        lockStatePoller = setInterval(async () => {
          setLocked(await controller.getLockState())
        }, 4 * 60 * 1000)
      }
      return () => {
        clearInterval(lockStatePoller)
        lockStatePoller = null
      }
    }
  }, [])
}

export default App;
