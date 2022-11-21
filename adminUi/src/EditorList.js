import React from 'react';
import {
  Grid, GridItem, VStack, Box, StackDivider
} from '@chakra-ui/react'
import EditorProperties from './EditorProperties'

/**  */
export default function EditorList({editor, setConfig, setEditItem}) {
  const [selected, setSelected] = React.useState(null)

  const content = editor.content
  // TODO: We're assuming here that the schema for array only has one top-level item, since
  //   where simply picking the first one. This is likely a resonable assumption since theres
  //   no way to support mixed-type lists, but perhaps we can make this more obvious in the
  //   schema format?
  if (editor.schema) {
    const itemSchema = editor.schema[Object.keys(editor.schema)[0]]

    const itemSelected = (ev, index) => {
      setSelected({ index: index, item: content[index] })
    }

    return <Grid
        templateAreas={`
          "edit edit"
        `}
        templateColumns={'15em 1fr'}
      >
      <GridItem color='brand.editorText' bg='brand.editorBgHack'>
        <VStack
          divider={<StackDivider borderColor='brand.editorDivider' />}
        >
          {content.map((item, index) => {
            return <Box
              name={index}
              onClick={ev => itemSelected(ev, index)}
            >{item.name}</Box>
          })}
        </VStack>
      </GridItem>
      <GridItem color='brand.editorText' bg='brand.editorBgHack'>
        {selected ? <EditorProperties
          key={selected ? selected.index : null}
          item={selected.item}
          itemSchema={itemSchema.properties}
          setConfig={setConfig}
          setEditItem={setEditItem}
        /> : null}
      </GridItem>
    </Grid>
  } else {
    return null
  }
}
