import React from 'react';
import { Textarea, Flex } from '@chakra-ui/react'
import YAML from 'yaml'
//import YamlEditor from '@focus-reactive/react-yaml';
//import { oneDark } from '@codemirror/theme-one-dark';

/**  */
export default function EditorRaw({id, editor, configs, contentToPut, locked}) {

  // Indicate there's new content to put on this path
  const pushContent = (path, source, id, editorId) => {
    contentToPut.current[path] = {
      source: source,
      id: id,
      editorId: editorId,
      editorType: 'raw',
      state: 'new'
    }
  }

  const safeParse = (text) => {
    try {
      return YAML.parse(text, { strict: false })
    } catch (e) {
      // ignore
    }
    return null
  }


  return <Flex w='100%' marginTop='0 !important'>
    <Flex
      flex='1'
      minH='calc(100vh - 6.25em)'
      padding='0.3em'
      color='editorText'
      bg='editorBg'
      maxHeight='calc(100vh - 6.25em)'
      overflowY='auto'
    >
      <Textarea
        key={'RawEdit_' + id}
        w='75%'
        h='100%'
        overflowX='auto'
        bg='white'
        color='editorText'
        defaultValue={YAML.stringify(configs.current[editor.id].content, { lineWidth: 0 })}
        isDisabled={locked}
        resize='none'
        onChangeCapture={ev => {
          const value = safeParse(ev.target.value)
          if (value) {
            configs.current[editor.id].content = value
            pushContent(editor.data, configs.current, editor.id, editor.id)
          }
        }}
      />
      <Textarea
        key={'RawEdit_' + id}
        w='25%'
        maxW='25%'
        h='100%'
        overflowX='auto'
        wordBreak={false}
        bg='white'
        color='editorText'
        defaultValue={YAML.stringify(configs.current[editor.id].schema, { lineWidth: 0 })}
        isDisabled={locked}
        resize='none'
        onChangeCapture={ev => {
          const value = safeParse(ev.target.value)
          if (value) {
            configs.current[editor.id].schema = value
            // TOOD: Need to add a way to push client-side schema updates to server. This is new
            //pushContent(editor.data, configs.current, editor.id, editor.id)
          }
        }}
      />
    </Flex>
  </Flex>

  // Fails with :
  // ht TypeError: Cannot read properties of undefined (reading 'baseTheme')
  //   at ./node_modules/@focus-reactive/react-yaml/dist/extensions/zebra-stripes.js (zebra-stripes.js:28:1)
  //
  // Possibly this componentn does not mix well with Chakra UI?  Searhing suggestrs this may be a MaterialUI based component.
  //   How to properly make theme available??

  // Possibly use the CodeMirror editor directly, or as a wrapper, as in this example:
  // https://glenn-viroux.medium.com/how-to-create-a-code-editor-in-react-with-chakraui-9d27ed24efcb

  // import React, {useState} from 'react';
  // import {Center, ChakraProvider, Divider, Heading, VStack} from "@chakra-ui/react";
  // import {githubLight} from '@uiw/codemirror-theme-github';
  // import {python} from "@codemirror/lang-python";
  // import CodeMirror from '@uiw/react-codemirror';


  // function App() {
  //     const [text, setText] = useState("print(\\"Hello world!\\")");
  //     return (
  //         <ChakraProvider>
  //             <Center h={"100vh"}>
  //                 <VStack boxShadow={'md'} p={4} borderStyle={"solid"} borderWidth={1} rounded={"lg"}>
  //                     <Heading>Code Editor</Heading>
  //                     <Divider/>
  //                     <CodeMirror
  //                         value={text}
  //                         onChange={(newValue) => setText(newValue)}
  //                         theme={githubLight}
  //                         extensions={[python()]}
  //                         basicSetup={{autocompletion: true}}
  //                         minWidth={'500px'}
  //                         minHeight={'500px'}
  //                     />
  //                 </VStack>
  //             </Center>
  //         </ChakraProvider>
  //     );
  // }
  // export default App;


  // return
  //   <YamlEditor
  //     key={'RawEdit_' + id}
  //     w='100%'
  //     h='100%'
  //     bg='white'
  //     theme={oneDark}
  //     color='editorText'
  //     isDisabled={locked}
  //     json={JSON.parse(configs.current[editor.id])}
  //     onChange={({ json, _text }) => {
  //       // onChange is only called for valid YAML/JSON
  //       configs.current[editor.id] = JSON.stringify(json)
  //       pushContent(editor.data, configs.current, editor.id, editor.id)
  //     }}
  //   />
}
