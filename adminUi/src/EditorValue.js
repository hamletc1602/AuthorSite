import React from 'react';
import {
  Input, NumberInput, Grid, GridItem, Box, Button, Checkbox, Textarea
} from '@chakra-ui/react'
import Editor from './Editor';

/**  */
export default function EditorValue({editor, item, setConfig}) {
  if (editor && item) {
    //{itemDefn, item, name, value}
    switch (item.itemDefn.type) {
      case 'object':
        return <Editor
          //bg='brand.editor'
          bg='white'
          color='brand.editorText'
          editor={editor}
          config={{content: item.value, schema: item.itemDefn}}
          setConfig={setConfig}
          setEditItem={item => {
            if (item) { console.log(`Admin UI does not support editing complext type ${item.itemDefn.type} at the tertiary value level.`) }
          }}
        />
      break;

      case 'text':
        return <Textarea
          defaultValue={item.value}
        />
      break;

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