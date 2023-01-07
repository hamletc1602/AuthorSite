import React, { } from 'react';
import {
  VStack, HStack, StackDivider, Grid, GridItem, Box, IconButton
} from '@chakra-ui/react'
import { DeleteIcon } from '@chakra-ui/icons'
import Util from './Util'
import EditorProperties from './EditorProperties';
import EditorText from './EditorText';
import EditorImage from './EditorImage';

/**  */
export default function Editor({editor, configs, path, setPath, fileContent, dispatchFileContent, getContent, pushContent}) {

  // Ignore changes if we're not the current editor in the path
  if (path[0].name !== editor.id) {
    return
  }

  const schema = Util.getSchemaForPath(configs, path)
  const hasList = schema.type === 'list'
  const rootPath = hasList ? getRootPath(path) : [...path]
  const content = Util.getContentForPath(configs, path)
  const rootContent = Util.getContentForPath(configs, rootPath)

  if (hasList && rootPath.length === path.length) {
    setPath([...rootPath, { index: 0, name: content[0][editor.listNameProp] }])
    return
  }

  const SubEditor = editorForType(hasList ? schema.elemType : schema.type)

  //const [index, setIndex] = useState(initIndex)

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
      Util.setContentForPath(configs, path, { file: Util.createFilePath(path, schema) })
      pushContent(editor.data, configs, editor.id)
      if ( ! fileContent[content.file]) {
        dispatchFileContent({
          path: content.file,
          content: { state: 'complete' }
        })
      }
    }
  }

  // Select a different item
  const itemSelected = (ev, index, name) => {
    setPath([...rootPath, { index: index, name: name }])
  }

  // Create a new item for a list
  const newItem = (ev) => {
    // Transform list schema into an item schema
    //  TODO: Should this be done here, or in Util? Makes the Util cleaner, but seems odd here?
    const newIndex = rootContent.length
    const newObj = Util.createNewFromSchema({ type: schema.elemType, properties: schema.properties })
    newObj[editor.listNameProp] = 'item' + newIndex
    rootContent.push(newObj)
    pushContent(editor.data, configs, editor.id)
    itemSelected(null, newIndex)
  }

  // Delete an item from a list
  const deleteItem = (ev) => {
    const index = getCurrIndex(path)
    rootContent.splice(index, 1)
    pushContent(editor.data, configs, editor.id)
    itemSelected(null, index > 0 ? index - 1 : 0)
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
  if (path && path.length > 1) {
    colWidths.push('' + path.length - 1 + 'em')
  } else {
    colWidths.push('0em')
  }
  if (hasList) {
    colWidths.push('10em')
  } else {
    colWidths.push('0em')
  }
  colWidths.push('10em')
  colWidths.push('1em')

  //
  return <Grid
    templateAreas={`
      "path list edit operations"
      `}
    templateColumns={colWidths}
  >
    <GridItem color='brand.editorText' bg='brand.editorBgHack'>
      <HStack>
        {rootPath.map((elem, index) => {
          if (index === 0) { return null } // Don't add an element for the editor (tab) part of the path
          return <Box
            key={index}
            onClick={() => setPath(rootPath.slice(0, index))}
            transform="rotate: '90deg'"
            h='100%'
            w='1em'
          >{elem.name}</Box>
        })}
      </HStack>
    </GridItem>
    <GridItem color='brand.editorText' bg='brand.editorBgHack'>
      {hasList ? <VStack
        divider={<StackDivider borderColor='brand.editorDivider' />}
      >
        {rootContent.map((item, index) => {
          const name = item[editor.listNameProp] || 'item' + index
          // TODO: Highlight current selected index item
          return <Box
            key={index}
            cursor='pointer'
            onClick={ev => itemSelected(ev, index, name)}
          >{name}</Box>
        }).concat([
          <Box
            key={-1}
            onClick={ev => newItem(ev)}
          >{'New ' + editor.title}</Box>
        ])}
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
    <GridItem color='brand.editorText' bg='brand.editorBgHack'>
      {hasList ? <IconButton size='sm' icon={<DeleteIcon />} onClick={deleteItem}/> : null}
    </GridItem>
  </Grid>
}

// Get inital list index from the index elem at the end of the path, or -1 if there's no index elem.
function getCurrIndex(path) {
  if (path.length > 0) {
    const last = path[path.length - 1]
    if (last.index) {
      return last.index
    }
    return -1
  }
  return null
}

// Get the root path less any initial index (if there's an index at the end of the path)
function getRootPath(path) {
  if (path.length > 0) {
    const last = path[path.length - 1]
    if (last.index !== undefined) {
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
