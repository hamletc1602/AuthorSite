import React from 'react';
import {
  Box, Textarea
} from '@chakra-ui/react'
import Editor from './Editor';
import Controller from './Controller'

/**  */
export default function EditorValue({editor, item, fileContent, setConfig, setFileContent}) {
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
        return <Textarea
          bg='white'
          color='brand.editorText'
          defaultValue={item.value ? fileContent[item.value.file] : ''}
          onChangeCapture={ev => {
            // Set value to the expected file path on the server
            //  Assuming all files are markdown for now - May provide a way for user to force text mode?
            let filePath = null
            if (item.item && item.item.name) {
              // Property is part of a list. Use a sanitized version of the list item name as the file name
              let fileName = item.item.name
              fileName = Controller.sanitizeS3FileName(fileName)
              filePath = `${editor.id}/${item.name}/${fileName}.md`
            } else {
              filePath = `${editor.id}/${item.name}.md`
            }
            setConfig(item.path, item.name, { file: filePath })
            // Set the file content in separate state (This will be used as the source for the periodic uploader)
            setFileContent(filePath, ev.target.value)
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