import React from 'react';
import {
  ChakraProvider, extendTheme,
  Text, Input, Button, Link, Textarea, Select,
  InputGroup, InputRightElement,
  Flex, Spacer,
  Grid,GridItem,
  Tabs, TabList, TabPanels, Tab, TabPanel,
  Spinner
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

function createEditor() {
  return <Textarea
    variant='flushed'
    color='brand.editorText'
    bg='brand.editor'
    h='calc(100vh - 9em)'
    resize='none'
    p='5px'
  />
}

const editorTabs = [{
    label: 'Editor1',
    content: createEditor()
  },{
    label: 'Editor2',
    content: createEditor()
  },{
    label: 'Editor3',
    content: createEditor()
  }]

const authState = 'unknown'
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
let serverState = {
  config: {},
  display: {},
  latest: []
}
const controller = new Controller(siteHost)

// Drive controller logic at a rate set by the UI:
// Check state as needed (variable rate)
const FastPollingTimeoutMs = 5 * 60 * 1000
let fastPollingTimeoutId = null
let maxPollingLoopCount = 30 // Default 30s updates
let pollLoopCount = 0
setInterval(() => {
  if (pollLoopCount >= maxPollingLoopCount) {
    try {
      if (controller.checkState() || !serverState.logs) {
        // There is new state available. Trigger UI refresh
        serverState = controller.getConfig()
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
}, 1000);
// Check lock state now, and every 4 minutes after
controller.getLockState()
setInterval(() => controller.getLockState(), 4 * 60 * 1000);

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
  const [showPwd, setShowPwd] = React.useState(false)
  const [generateDebug, setGenerateDebug] = React.useState(false)
  const [currTemplateId, setCurrTemplateId] = React.useState(false)

  // Handlers
  const viewPwdClick = () => setShowPwd(!showPwd)
  const generateDebugClick = () => setGenerateDebug(!generateDebug)
  const onTemplateIdChange = (templateId) => { setCurrTemplateId(templateId) }
  const onPrepare = () => { controller.sendCommand('template', { id: currTemplateId }) }
  const onGenerate = () => {
    controller.sendCommand('build', { id: currTemplateId, debug: generateDebug })
  }
  const onPublish = () => { controller.sendCommand('publish') }
  const latestLogUpdate = () => {
    if (serverState.latest.length > 0) {
      return <Text size='xs' w='100%'>{serverState.display.stepMsg}: {serverState.latest[0]}</Text>
    } else {
      return <Text size='xs' w='100%' color='brand.disabledBaseText'>No log messages yet...</Text>
    }
  }

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
              <Input type={showPwd ? 'text' : 'password'} color='brand.accentText' placeholder='Password...'/>
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
              defaultValue={currTemplateId}
              onChange={onTemplateIdChange}
            >
              {templates}
            </Select>
            <Button size='sm' m='3px' onClick={onPrepare}>Prepare</Button>
          </Flex>
        </GridItem>
        <GridItem bg='brand.base'>
          <Flex>
            <Button size='sm' m='3px' onClick={onGenerate}>
              {generateDebug ? 'Generate Debug' : 'Generate'}
            </Button>
            <Link href='' size='sm' isExternal>Test Site <ExternalLinkIcon mx='2px'/></Link>
          </Flex>
        </GridItem>
        <GridItem bg='brand.base'>
          <Flex>
            <Button size='sm' m='3px' onClick={onPublish}>Publish</Button>
            <Link href='' size='sm' isExternal>Site <ExternalLinkIcon mx='2px'/></Link>
          </Flex>
        </GridItem>
        <GridItem>
          {latestLogUpdate()}
        </GridItem>
        <GridItem
          colSpan={3}
          bg='brand.accent'
        >
          <Tabs size='sm' isLazy lazyBehavior='keepMounted'>
            <TabList>
              {editorTabs.map((tab, index) => (
                <Tab color='white' key={index}>{tab.label}</Tab>
              ))}
            </TabList>
            <TabPanels bg='brand.base'>
              {editorTabs.map((tab, index) => (
                <TabPanel p='0' key={index}>
                  {tab.content}
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>
        </GridItem>
        <GridItem h='1.55em' colSpan={3} bg='brand.accent'>
          <Flex>
              <Text fontSize='xs' m='2px 5px' color='brand.accentText'>Copyright BraeVitae 2022</Text>
              <InfoOutlineIcon m='3px' color={generateDebug ? 'brand.accentActiveText' : 'brand.accentText'} onClick={generateDebugClick}/>
          </Flex>
        </GridItem>
      </Grid>
    </ChakraProvider>
  );
}

export default App;
