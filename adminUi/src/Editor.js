import React from 'react';
import {
} from '@chakra-ui/react'
import EditorList from './EditorList'
import EditorProperties from './EditorProperties'

/**  */
export default function Editor({editor, setConfig, setEditItem}) {
  if ( ! editor.content || ! editor.schema) {
    return null
  }
  if (Array.isArray(editor.content)) {
    return <EditorList
      editor={editor}
      setConfig={setConfig}
      setEditItem={setEditItem}
    />
  } else {
    return <EditorProperties
      item={editor ? editor.content : null}
      itemSchema={editor && editor.schema ? editor.schema.properties : null}
      setConfig={setConfig}
      setEditItem={setEditItem}
    />
  }
}
