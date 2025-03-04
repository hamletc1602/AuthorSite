import React from 'react';
import {} from '@chakra-ui/react'
import YamlEditor from '@focus-reactive/react-yaml';
import { oneDark } from '@codemirror/theme-one-dark';

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

  // Fails with :
  // ht TypeError: Cannot read properties of undefined (reading 'baseTheme')
  //   at ./node_modules/@focus-reactive/react-yaml/dist/extensions/zebra-stripes.js (zebra-stripes.js:28:1)
  //
  // Possibly this componentn does not mix well with Chakra UI?  Searhing suggestrs this may be a MaterialUI based component.
  //   How to properly make theme available??


  return
    <YamlEditor
      key={'RawEdit_' + id}
      w='100%'
      h='100%'
      bg='white'
      theme={oneDark}
      color='editorText'
      isDisabled={locked}
      json={JSON.parse(configs.current[editor.id])}
      onChange={({ json, _text }) => {
        // onChange is only called for valid YAML/JSON
        configs.current[editor.id] = JSON.stringify(json)
        pushContent(editor.data, configs.current, editor.id, editor.id)
      }}
    />
}
