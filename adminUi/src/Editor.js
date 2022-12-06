import React, { useState } from 'react';
import {
  VStack, HStack, StackDivider, Grid, GridItem, Box
} from '@chakra-ui/react'
import Util from './Util'
import EditorProperties from './EditorProperties';
import EditorText from './EditorText';
import EditorImage from './EditorImage';

/**  */
export default function Editor({editor, configs, path, setPath, fileContent, dispatchFileContent, getContent, pushContent}) {

  const content = Util.getContentForPath(configs, path)
  const schema = Util.getSchemaForPath(configs, path)
  const hasList = Array.isArray(content)
  const initIndex = hasList ? getInitIndex(path) : null
  const rootPath = hasList ? getRootPath(path) : [...path]
  const SubEditor = editorForType(schema.type)

  const [index, setIndex] = useState(initIndex)

  // For types with associated file content, if the file content is not already in the
  // content cach, start a get from the server.
  // TODO: If there's multiple renders while the content is downloading, multiple gets could be started.
  //   Perhaps add a 'pending' placeholder record here in the content cache that will be replaced when the
  //   content download completes?
  if (schema.type === 'image' || schema.type === 'text') {
    if (content.file) {
      if ( ! fileContent[content.file]) {
        dispatchFileContent({
          path: content.file,
          content: { state: 'pending' }
        })
        getContent(content.file)
      }
    } else {
      // file type, but without a path in the config. Set a default file path based on the current
      // item path and update the server config.
      content.file = Util.createFilePath(path)
      pushContent(editor.data, configs, editor.id)
      if ( ! fileContent[content.file]) {
        dispatchFileContent({
          path: content.file,
          content: { state: 'complete' }
        })
      }
    }
  }

  const itemSelected = (ev, index, name) => {
    setIndex(index)
    setPath([...rootPath, { index: index, itemName: name }])
  }

  // Update this data value in the config. Push the config data to the server if the value has
  // changed. Push the referenced file to the server if this is a text or image type value.
  const setData = (name, value) => {
    const oldValue = content[name]
    if (value !== oldValue) {
      content[name] = value
      pushContent(editor.data, configs, editor.id)
    }
    if (name === 'file' && (schema.type === 'image' || schema.type === 'text')) {
      // The subEditor will have already updated the fileContent cache in this case.
      pushContent(value, fileContent, value)
    }
  }

  // Switch to editing a child item by updating the path with it's name (this will force a re-render)
  const editItem = (name) => setPath([...path, { name: name }])

  // Create grid col widths
  const colWidths = []
  if (path) {
    colWidths.push('' + path.length + 'em')
  }
  if (hasList) {
    colWidths.push('10em')
  }
  colWidths.push('10em')
  colWidths.push('1fr')

  //
  return <Grid
      templateAreas={`
      "path list edit edit"
    `}
    templateColumns={colWidths}
  >
    <GridItem color='brand.editorText' bg='brand.editorBgHack'>
      <HStack>
        {path.map((elem, index) => {
          if (index === 0) { return null } // Don't add an element for the editor (tab) part of the path
          return <Box
            onClick={() => setPath(rootPath.slice(0, index))}
          >{elem}</Box>
        })}
      </HStack>
    </GridItem>
    <GridItem color='brand.editorText' bg='brand.editorBgHack'>
      {hasList ? <VStack
        divider={<StackDivider borderColor='brand.editorDivider' />}
      >
        {content.data.map((item, index) => {
          const name = item[editor.listNameProp] || 'item' + index
          return <Box
            key={index}
            onClick={ev => itemSelected(ev, index, name)}
          >{name}</Box>
        })}
      </VStack> : null }
    </GridItem>
    <GridItem color='brand.editorText' bg='brand.editorBgHack'>
      <HStack>
        <SubEditor
          id='editor'
          content={content}
          schema={schema}
          fileContent={fileContent}
          dispatchFileContent={dispatchFileContent}
          setData={setData}
          editItem={editItem}
        ></SubEditor>
      </HStack>
    </GridItem>
  </Grid>
}

// Get inital list index from the index elem at the end of the path, or 0 if there's no index elem.
function getInitIndex(path) {
  if (path.length > 0) {
    const last = path[path.length - 1]
    if (last.index) {
      return last.index
    }
    return 0
  }
  return null
}

// Get the root path less any initial index (if there's an index at the end of the path)
function getRootPath(path) {
  if (path.length > 0) {
    const last = path[path.length - 1]
    if (last.index) {
      return path.slice(0, -1)
    }
    return [...path]
  }
  return []
}

// Return the editor component to use for this data type.
function editorForType(type) {
  switch (type) {
    case 'object':
      return EditorProperties
    case 'image':
      return EditorImage
    case 'text':
      return EditorText
    default:
      throw new Error(`Unknown object type ${type}`)
  }
}
