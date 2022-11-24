import React from 'react';
import {
  Box
} from '@chakra-ui/react'
import EditorList from './EditorList'
import EditorProperties from './EditorProperties'

/**  */
export default function Editor({editor, config, setConfig, setEditItem}) {
  if ( ! config.content || ! config.schema) {
    return null
  }
  if (Array.isArray(config.content)) {
    return <EditorList
      editor={editor}
      config={config}
      setConfig={setConfig}
      setEditItem={setEditItem}
    />
  } else {
    return <Box
        p='2' w='100%'
        color='brand.editorText'
        bg='brand.editorBgHack'
      >
        <EditorProperties
          id={config.id}
          item={editor ? config.content : null}
          itemSchema={config ? config.schema : null}
          setConfig={setConfig}
          setEditItem={setEditItem}
        />
      </Box>
  }
}
