import React from 'react';
import {
  ChakraProvider, extendTheme,
  Text, Input, Button, Link, Textarea, Select,
  InputGroup, InputRightElement,
  Flex, Spacer,
  Grid,GridItem,
  Tabs, TabList, TabPanels, Tab, TabPanel,
  Badge, Spinner
} from '@chakra-ui/react';
import {
  InfoIcon, CheckIcon, NotAllowedIcon, ViewIcon, ViewOffIcon, QuestionOutlineIcon,
  ExternalLinkIcon
} from '@chakra-ui/icons'

// Theme
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
      accent: 'blue',
      accentText: 'white',
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
  <option value='author'>Author</option>,
  <option value='artist'>Artist</option>
]

function createEditor() {
  return <Textarea
    variant='flushed'
    color='brand.editorText'
    bg='brand.editor'
    h='calc(100vh - 10.25em)'
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

function App() {
  const [show, setShow] = React.useState(false)
  const handleClick = () => setShow(!show)

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
        templateColumns={'15em 1fr 10em'}
      >
        <GridItem colSpan={3} color='brand.base' bg='brand.accent'>
          <Flex>
            <InfoIcon color='brand.accentText' m='5px'/>
            <Text color='brand.accentText' m='2px'>Site Admin</Text>
            <Spacer/>
            {authStates[authState].icon}
            <InputGroup w='15em' size='xs' m='2px'>
              <Input type={show ? 'text' : 'password'} color='brand.accentText' placeholder='Password...'/>
              <InputRightElement color='brand.accentText' onClick={handleClick}>
                {show ? <ViewOffIcon/> : <ViewIcon/>}
              </InputRightElement>
            </InputGroup>
          </Flex>
        </GridItem>
        <GridItem bg='brand.base'>
          <Flex>
            <Select
              variant='flushed'
              size='sm'
              w='20em'
              m='3px'
              placeholder='Select a template...'
              //options={templates}
            >
              {templates}
            </Select>
            <Button size='sm' m='3px'>Prepare</Button>
          </Flex>
        </GridItem>
        <GridItem bg='brand.base'>
          <Flex>
            <Button size='sm' m='3px'>Generate</Button>
            <Button size='sm' m='3px'>Generate Debug</Button>
            <Link href='' size='sm' isExternal>Test Site <ExternalLinkIcon mx='2px'/></Link>
          </Flex>
        </GridItem>
        <GridItem bg='brand.base'>
          <Flex>
            <Button size='sm' m='3px'>Publish</Button>
            <Link href='' size='sm' isExternal>Site <ExternalLinkIcon mx='2px'/></Link>
          </Flex>
        </GridItem>
        <GridItem>
          <Text size='xs' w='100%'>Status...</Text>
        </GridItem>
        <GridItem
          //h='calc(100vh - 9.5em)'
          colSpan={3}
          bg='brand.accent'
        >
          <Tabs isLazy>
            <TabList>
              {editorTabs.map((tab, index) => (
                <Tab color='white' key={index}>{tab.label}</Tab>
              ))}
            </TabList>
            <TabPanels p='0' bg='brand.base'>
              {editorTabs.map((tab, index) => (
                <TabPanel p={4} key={index}>
                  {tab.content}
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>
        </GridItem>
        <GridItem h='2em' colSpan={3} color='brand.accentText' bg='brand.accent'>
          <Flex>
              <Text size='xs' m='2px 5px'>Copyright BraeVitae 2022</Text>
          </Flex>
        </GridItem>
      </Grid>
    </ChakraProvider>
  );
}

export default App;
