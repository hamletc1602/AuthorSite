import React from 'react';
import {
  Box, Textarea
} from '@chakra-ui/react'
import Editor from './Editor';

/**  */
export default function EditorText({editor, item, fileContent, setConfig, setFileContent}) {
  if (editor && item) {
    switch (item.schema.type) {
      case 'object':
        return <Editor
          //bg='brand.editor'
          bg='white'
          color='brand.editorText'
          editor={editor}
          config={{content: item.value, schema: item.schema.properties,  path: item.path}}
          setConfig={setConfig}
          setEditItem={item => {
            // TODO: A third level is needed in the case where a properties edit has a complex value, which also has a complex
            //   value. It should fit in the screen, since there's no list in this case ??
            if (item) { console.log(`Admin UI does not support editing complext type ${item.schema.type} at the tertiary value level.`) }
          }}
        />

      case 'text':
        let content = null
        if (item.value) {
          const contentRec = fileContent[item.value.file]
          if (contentRec) {
            content = contentRec.content ? contentRec.content.toString() : contentRec.content
          }
        }
        return <Textarea
          bg='white'
          color='brand.editorText'
          defaultValue={content}
          onChangeCapture={ev => {
            // Set the file content in separate state (This will be used as the source for the periodic uploader)
            setFileContent(item.value.file, ev.target.value)
          }}
        />

      // case 'image':
      // break;

      default:
        return <Box
          //bg='brand.editor'  // TODO: custom colurs don't appear to work here. Why?
          bg='white'
        >
          {JSON.stringify(item.value)}
        </Box>
    }
  }
}