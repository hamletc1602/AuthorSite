import React, { useState } from 'react';
import {
  VStack, HStack, StackDivider, Grid, GridItem, Box
} from '@chakra-ui/react'

/**  */
export default function Editor({content, dispatchContent, initPath, setPath, editItem}) {

  const hasList = Array.isArray(content.data)
  const initIndex = hasList ? getInitIndex(initPath) : null
  const rootPath = initIndex ? initPath.slice(-1) : initPath

  const [index, setIndex] = useState(initIndex)

  const data = hasList ? content.data[index] : content.data
  const item = hasList ? data[index] : data
  const SubEditor = content.editorComp

  const itemSelected = (ev, index) => {
    setIndex(index)
    setPath([...rootPath, { index: index }])
  }

  // Create grid col widths
  const colWidths = []
  if (content.path) {
    colWidths.push('' + content.path.length + 'em')
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
        {content.path.map((elem, index) => {
          if (index === 0) { return null } // Don't add an element for the editor (tab) part of the path
          return <Box
            onClick={() => editItem(rootPath.slice(0, index))}
          >{elem}</Box>
        })}
      </HStack>
    </GridItem>
    <GridItem color='brand.editorText' bg='brand.editorBgHack'>
      {hasList ? <VStack
        divider={<StackDivider borderColor='brand.editorDivider' />}
      >
        {content.data.map((item, index) => {
          const name = item[content.editor.listNameProp] || 'item' + index
          return <Box
            key={index}
            onClick={ev => itemSelected(ev, index)}
          >{name}</Box>
        })}
      </VStack> : null }
    </GridItem>
    <GridItem color='brand.editorText' bg='brand.editorBgHack'>
      <HStack>
        <SubEditor
          id='editor'
          schema={content.schema}
          data={item}
          setData={(name, value) => dispatchContent({ name: name, value: value })}
          editItem={name => index ? editItem([...rootPath, { index: index }, { name: name }]) : editItem([...rootPath, { name: name }])}
        ></SubEditor>
      </HStack>
    </GridItem>
  </Grid>
}

function getInitIndex(path) {
  if (path.length > 0) {
    const last = path[path.length - 1]
    if (last.index) {
      return last.index
    }
  }
  return null
}