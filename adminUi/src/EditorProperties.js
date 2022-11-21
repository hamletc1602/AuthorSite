import React from 'react';
import {
  Input, NumberInput, Grid, GridItem, Box, Button, Checkbox
} from '@chakra-ui/react'

/**  */
export default function EditorProperties({item, itemSchema, setConfig, setEditItem}) {

  const editField = (itemType, name, value) => {
    switch (itemType) {
      case 'string': return <Input size='sm'
          defaultValue={value}
          onChange={ev => { item[name] = ev.target.value; setConfig() }}
          />
      case 'number': return <NumberInput size='sm'
        defaultValue={value}
        onChange={ev => { item[name] = ev.target.value; setConfig() }}
        />
      case 'boolean': return <Checkbox size='sm'
        isChecked={value}
        onChange={ev => { item[name] = ev.target.checked; setConfig() }}
        />
      case 'object': return <Button size='sm'
        onClick={() => setEditItem({type: itemType, item: item, name: name, value: value})}
        >Edit</Button>
      case 'text': return <Button size='sm'
        onClick={() => setEditItem({type: itemType, item: item, name: name, value: value})}
        >Edit</Button>
      case 'image': return <Button size='sm'
        onClick={() => setEditItem({type: itemType, item: item, name: name, value: value})}
        >Edit</Button>
      default:
        console.warn(`Unnexpected config value type: ${itemType}`)
    }
  }

  if (item) {
    const names = Object.keys(item)
    return <Grid
        templateAreas={`
        "edit edit"
      `}
      templateColumns={'10em 1fr'}
    >
      {names.map(name => {
        if ( ! (itemSchema && itemSchema[name])) {
          return null
        }
        const itemType = itemSchema[name].type
        const value = item[name]
        return [
          <GridItem><Box>{name}</Box></GridItem>,
          <GridItem>{editField(itemType, name, value)}</GridItem>
        ]
      }).flat()}
      </Grid>
  }
}
