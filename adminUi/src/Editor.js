import React, { useEffect, useMemo, useState } from 'react'
import {
  VStack, Flex, Text, Box, IconButton, Tooltip, Spacer,
  Breadcrumb, BreadcrumbItem, BreadcrumbLink
} from '@chakra-ui/react'
import { DeleteIcon, CloseIcon, AddIcon, ArrowLeftIcon, ArrowDownIcon, ArrowUpIcon } from '@chakra-ui/icons'
import Util from './Util'
import EditorProperties from './EditorProperties'
import EditorText from './EditorText'
import EditorImage from './EditorImage'

/**  */
export default function Editor({
  editor, configs, path, setPath, fileContent, getContent, pushContent, putContentComplete, advancedMode,
  locked
}) {

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
      if (content.length > 0) {
        setPath([...rootPath, { index: 0, name: content[0][schema.nameProp] }])
      }
      return
    }
  }, [hasList, rootPath, path, setPath, content, editor, schema.nameProp])

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
    // TODO: If there's multiple renders while the content is downloading, multiple gets could be started?
    //   Perhaps add a 'pending' placeholder record here in the content cache that will be replaced when the
    //   content download completes?
  }

  // Select a different item
  const itemSelected = (ev, index, name) => {
    setPath([...rootPath, { index: index, name: name }])
  }

  // Create a new item for a list
  const newItem = (ev) => {
    if (locked) { return }
    // Transform list schema into an item schema
    //  TODO: Should this be done here, or in Util? Makes the Util cleaner, but seems odd here?
    const newIndex = rootContent.length
    const newObj = Util.createNew(rootPath, { type: schema.elemType, properties: schema.properties })
    newObj[schema.nameProp] = 'item' + newIndex
    if (schema.addAtEnd) {
      rootContent.unshift(newObj)
    } else {
      rootContent.push(newObj)
    }
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

  // Move the selected item up on rank in the list (swap it with the previous item)
  const moveItemUp = (ev) => {
    if (pathIndex <= 0) {
      console.warn(`Can't move item above head of list.`)
      return;
    }
    const tmp = rootContent[pathIndex - 1]
    rootContent[pathIndex - 1] = rootContent[pathIndex]
    rootContent[pathIndex] = tmp
    pushContent(editor.data, configs.current, editor.id)
    itemSelected(null, pathIndex - 1)
  }

  // Move the selected item up on rank in the list (swap it with the previous item)
  const moveItemDown = (ev) => {
    if (pathIndex >= (rootContent.length - 1)) {
      console.warn(`Can't move item after the end of the list.`)
      return;
    }
    const tmp = rootContent[pathIndex + 1]
    rootContent[pathIndex + 1] = rootContent[pathIndex]
    rootContent[pathIndex] = tmp
    pushContent(editor.data, configs.current, editor.id)
    itemSelected(null, pathIndex + 1)
  }

  // Update this data value in the config. Push the config data to the server if the value has
  // changed. Push the referenced file to the server if this is a text or image type value.
  const setData = (name, value) => {
    let currContent = content
    if (schema.type === 'image') {
      // Image File Content
      // For image files, the value is an object with extra data.
      // The subEditor will have already updated the fileContent cache in this case.
      const imageProps = value
      pushContent(imageProps.name, fileContent.current, imageProps.name)
      // Ensure the content file path is updated in config if the editor changed it
      currContent = Util.getContentForPath(configs, path.slice(0, -1))
      name = path[path.length - 1].name
      //
      currContent[name] = imageProps.name
      // Update the image path, and Set other image prop values if the relevant poperty names exist.
      const parentSchema = Util.getSchemaForPath(configs, path.slice(0, -1))
      const typeProp = name + 'Type'
      if (parentSchema.properties[typeProp]) {
        currContent[typeProp] = imageProps.type
      }
      const widthProp = name + 'Width'
      if (parentSchema.properties[widthProp]) {
        currContent[widthProp] = imageProps.width
      }
      const heightProp = name + 'Height'
      if (parentSchema.properties[heightProp]) {
        currContent[heightProp] = imageProps.height
      }
      pushContent(editor.data, configs.current, editor.id)
    } else if (schema.type === 'text') {
      // Text File Content
      // The subEditor will have already updated the fileContent cache in this case.
      pushContent(value, fileContent.current, value)
      // Ensure the content file path is updated in config if the editor changed it
      currContent = Util.getContentForPath(configs, path.slice(0, -1))
      name = path[path.length - 1].name
    } else {
      // Upate the server content if this property value has changed
      const oldValue = currContent[name]
      if (value !== oldValue) {
        currContent[name] = value
        pushContent(editor.data, configs.current, editor.id)
      }
    }
  }

  // Switch to editing a child item by updating the path with it's name (this will force a re-render)
  const editItem = (name) => setPath([...path, { name: name }])

  function breadcrumbs() {
    if (hierarchyPath.length === 0) {
      return []
    }
    const crumbs = []
    crumbs.push(<BreadcrumbItem key='root'>
        <BreadcrumbLink href='#' onClick={() => setPath(rootPath.slice(0, 1))}>
          <ArrowLeftIcon margin='0 0 3px 3px'/><Text display='inline' marginLeft='0.25em'>{'Back'}</Text>
        </BreadcrumbLink>
      </BreadcrumbItem>)
    //WARN: Linter will say this nested block ({}) around the forEach is redundent, but if you remove it.
    // React processing throws a 'push(...) is not a function error when trying to append to the array.
    /*eslint-disable no-lone-blocks */
    {(hierarchyPath.slice(0, -1)).forEach(elem => {
      crumbs.push(<BreadcrumbItem key={elem.origIndex}>
          <BreadcrumbLink href='#' onClick={() => setPath(rootPath.slice(0, elem.origIndex))}>
            {elem.indexName ? '[' + elem.indexName + '] ' + elem.name : elem.name}
          </BreadcrumbLink>
        </BreadcrumbItem>)
    })}
    /*eslint-enable no-lone-blocks */
    const last = hierarchyPath[hierarchyPath.length - 1]
    crumbs.push(<BreadcrumbItem key='current' isCurrentPage>
        <BreadcrumbLink
          href='#' onClick={() => setPath(rootPath.slice(0, last.origIndex))}
          _hover={{textDecor: 'none', cursor: 'default'}}
          marginBottom='3px'
        >
          {last.indexName ? '[' + last.indexName + '] ' + last.name : last.name}
        </BreadcrumbLink>
      </BreadcrumbItem>)
    return crumbs
  }

  //
  return <VStack
    key='Editor'
  >
    {hierarchyPath.length > 0 ? <Breadcrumb
      onClick={() => setPath(rootPath.slice(0, hierarchyPath[hierarchyPath.length - 1].origIndex))}
      w='100%' padding='0 3px 0 3px'
    >
      {breadcrumbs()}
    </Breadcrumb> : null}
    <Flex w='100%' marginTop='0 !important'>
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
              color={locked ? 'gray.400' : 'inherit'}
              cursor={locked ? 'not-allowed' : 'pointer'}
              onClick={ev => newItem(ev)}
            >{[<AddIcon key='newItemIcon'/>, ' ', 'Add ' + schema.addTitle]}</Box>
            ,
            {rootContent.map((item, index) => {
              const name = item[schema.nameProp] || 'item' + index
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
          path={path}
          content={content}
          schema={schema}
          fileContent={fileContent}
          setData={setData}
          editItem={editItem}
          putContentComplete={putContentComplete}
          advancedMode={advancedMode}
          locked={locked}
        ></SubEditor>
      </Flex>
      <Flex key='ops' color='editorText' bg='editorBg'>
        {hasList ?
          <VStack>
            {inDelete ?
              [<Tooltip openDelay={650} closeDelay={250} placement='left-start' label='Cancel Delete' hasArrow={true} aria-label='Cancel'>
                <IconButton size='sm' icon={<CloseIcon/>} onClick={cancelDeleteItem}/>
              </Tooltip>,
              <Tooltip openDelay={650} closeDelay={250}  placement='left-start'label='Confirm Delete' hasArrow={true} aria-label='Confirm Delete'>
                <IconButton size='sm' icon={<DeleteIcon color='danger'/>} onClick={deleteItem}/>
              </Tooltip>]
            :
              [<Tooltip openDelay={650} closeDelay={250}  placement='left-start'label='Delete List Item' hasArrow={true} aria-label='Delete List Item'>
                <IconButton size='sm' icon={<DeleteIcon />} onClick={deleteItem} disabled={locked}/>
              </Tooltip>,
              <Box height='1em'/>,
              <Tooltip openDelay={850} closeDelay={250} placement='left-start' label='Move List Item Up' hasArrow={true} aria-label='Move List Item Up'>
                <IconButton size='sm' icon={<ArrowUpIcon />} onClick={moveItemUp} disabled={locked}/>
              </Tooltip>,
              <Tooltip openDelay={850} closeDelay={250} placement='left-start' label='Move List Item Down' hasArrow={true} aria-label='Move List Item Down'>
                <IconButton size='sm' icon={<ArrowDownIcon />} onClick={moveItemDown} disabled={locked}/>
              </Tooltip>]}
          </VStack>
        : null}
      </Flex>
    </Flex>
  </VStack>
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
