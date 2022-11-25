import React from 'react';
import {
  Grid, GridItem, VStack, Box, StackDivider
} from '@chakra-ui/react'
import EditorProperties from './EditorProperties'

/**  */
export default function EditorList({editor, config, setConfig, setEditItem}) {
  const content = config.content

  const [selected, setSelected] = React.useState({ index: 0, name: content[0][editor.listNameProp], path: [...config.path, 0], item: content[0] })

  const itemSelected = (ev, index, name) => {
    setSelected({ index: index, name: name, path: [...config.path, index], item: content[index] })
    setEditItem(null)
  }

  return <Grid
      templateAreas={`
        "edit edit"
      `}
      templateColumns={'8em 1fr'}
    >
    <GridItem color='brand.editorText' bg='brand.editorBgHack'>
      <VStack
        divider={<StackDivider borderColor='brand.editorDivider' />}
      >
        {content.map((item, index) => {
          const name = item[editor.listNameProp] || 'item' + index
          return <Box
            key={index}
            onClick={ev => itemSelected(ev, index, name)}
          >{name}</Box>
        })}
      </VStack>
    </GridItem>
    <GridItem color='brand.editorText' bg='brand.editorBgHack'>
      {selected ? <EditorProperties
        id={selected ? selected.index : null}
        item={{name: selected.name, content: selected.item, schema: config.schema.properties, path: selected.path}}
        setConfig={setConfig}
        setEditItem={setEditItem}
      /> : null}
    </GridItem>
  </Grid>
}
