import React, { useEffect, useMemo, useState } from 'react';
import {
  VStack, Flex, StackDivider, Box, IconButton
} from '@chakra-ui/react'
import { DeleteIcon, CloseIcon, AddIcon } from '@chakra-ui/icons'
import Util from './Util'
import EditorProperties from './EditorProperties';
import EditorText from './EditorText';
import EditorImage from './EditorImage';

/**  */
export default function Editor({editor, configs, path, setPath, fileContent, getContent, pushContent}) {

  const schema = Util.getSchemaForPath(configs, path)
  const hasList = schema.type === 'list'
  const rootPath = useMemo(() => hasList ? Util.getRootPath(path) : [...path], [hasList, path])
  const content = Util.getContentForPath(configs, path)
  const [inDelete, setInDelete] = useState(false)

  // This setPath call was triggering the " Cannot update a component (`App`) while rendering a different component (`Editor`)."
  // warning. Wrapping it in useEffect appears to resolve that warning, but I'm not sure I fully understand why, so this could
  // be a misleading fix. Possibly it would be better to ponder how the 'path' state is handled - does it need to be state at the
  // App level, or can it just be state for Editor??
  useEffect(() => {
    // Ignore changes if we're not the current editor in the path
    if (path[0].name !== editor.id) {
      return
    }
    if (hasList && rootPath.length === path.length) {
      setPath([...rootPath, { index: 0, name: content[0][editor.listNameProp] }])
      return
    }
  }, [hasList, rootPath, path, setPath, content, editor])

  // Ignore changes if we're not the current editor in the path
  if (path[0].name !== editor.id) {
    return
  }

  const rootContent = Util.getContentForPath(configs, rootPath)
  const hierarchyPath = Util.condensePath(rootPath).slice(1).reverse()
  const pathIndex = hasList ? Util.getCurrIndex(path) : 0
  const SubEditor = editorForType(hasList ? schema.elemType : schema.type)

  // For types with associated file content, if the file content is not already in the
  // content cach, start a get from the server.
  if (schema.type === 'image' || schema.type === 'text') {
    if ( ! fileContent.current[content]) {
      getContent(content)
    }
    // TODO: If there's multiple renders while the content is downloading, multiple gets could be started.
    //   Perhaps add a 'pending' placeholder record here in the content cache that will be replaced when the
    //   content download completes?
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
    pushContent(editor.data, configs.current, editor.id)
    itemSelected(null, newIndex)
  }

  // Indicate desire to delete an item from a list
  const cancelDeleteItem = (ev) => {
    setInDelete(false)
  }

  // Really Delete an item from a list
  const deleteItem = (ev) => {
    if (inDelete) {
      rootContent.splice(pathIndex, 1)
      pushContent(editor.data, configs.current, editor.id)
      itemSelected(null, pathIndex > 0 ? pathIndex - 1 : 0)
      setInDelete(false)
    } else {
      setInDelete(true)
    }
  }

  // Update this data value in the config. Push the config data to the server if the value has
  // changed. Push the referenced file to the server if this is a text or image type value.
  const setData = (name, value) => {
    const oldValue = content[name]
    if (value !== oldValue) {
      content[name] = value
      pushContent(editor.data, configs.current, editor.id)
    }
    if (name === 'file' && (schema.type === 'image' || schema.type === 'text')) {
      // The subEditor will have already updated the fileContent cache in this case.
      pushContent(value, fileContent.current, value)
    }
  }

  // Switch to editing a child item by updating the path with it's name (this will force a re-render)
  const editItem = (name) => setPath([...path, { name: name }])

  // Create grid col widths
  const colWidths = []
  colWidths.push('' + hierarchyPath.length + 'em')
  if (hasList) {
    colWidths.push('10em')
  } else {
    colWidths.push('0em')
  }
  colWidths.push('10em')
  colWidths.push('1em')

  const hierarchyStackHeight = 10

  //
  return <Flex
    key='Editor'
  >
    <Flex
      align='flex-start'
      color='editorText'
      bg='blue.100'
      w={(hierarchyPath.length * 1.3) + 'em'}
    >
      <VStack
        spacing={0}
        transform='rotate(90deg)'
        align='left'
        position='relative'
        minW={hierarchyStackHeight + 'em'}
        top={4 + 'em'}
        left={-4 + 'em'}
        divider={<StackDivider borderColor='editorDivider' />}
      >
        {hierarchyPath.map((elem, index) => {
          let name = elem.name
          if (elem.indexName) {
            name = elem.indexName + ' / ' + elem.name
          }
          return <Box
            key={'hierarchy_' + index}
            onClick={() => setPath(rootPath.slice(0, elem.origIndex))}
            bg='blue:200'
            fontWeight='bold'
            cursor='pointer'
            whiteSpace='nowrap'
            textTransform='capitalize'
          >{name}</Box>
        })}
      </VStack>
    </Flex>
    <Flex color='editorText' bg='editorBg' w={(hasList ? 10 : 0) + 'em'}>
      {hasList ? <VStack
        spacing={0}
      >
        [
          <Box
            key={'listNew_' + editor.id}
            width='10em'
            padding='3px'
            bg='listNew'
            cursor='pointer'
            onClick={ev => newItem(ev)}
          >{[<AddIcon key='newItemIcon'/>, ' ', 'Add ' + (editor.addTitle || editor.title)]}</Box>
          ,
          {rootContent.map((item, index) => {
            const name = item[editor.listNameProp] || 'item' + index
            return <Box
              key={'list' + index + '_' + editor.id}
              size='sm'
              bg={index === pathIndex ? 'listSelected' : 'editorBg'}
              width='10em'
              padding='3px'
              cursor='pointer'
              onClick={ev => itemSelected(ev, index, name)}
            >{name}</Box>
            })}
        ]
      </VStack> : null }
    </Flex>
    <Flex
      flex='1'
      minH='10em'
      padding='0.3em'
      color='editorText'
      bg='editorBg'
    >
      <SubEditor
        key={editor.id}
        id={editor.id}
        content={content}
        schema={schema}
        fileContent={fileContent}
        setData={setData}
        editItem={editItem}
      ></SubEditor>
    </Flex>
    <Flex key='ops' color='editorText' bg='editorBg'>
      {hasList ?
        inDelete ?
          <VStack>
            <IconButton size='sm' icon={<CloseIcon/>} onClick={cancelDeleteItem}/>
            <IconButton size='sm' icon={<DeleteIcon color='danger'/>} onClick={deleteItem}/>
          </VStack>
        :
          <IconButton size='sm' icon={<DeleteIcon />} onClick={deleteItem}/>
      : null}
    </Flex>
  </Flex>
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
