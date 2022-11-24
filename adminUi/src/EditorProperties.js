import React from 'react';
import {
  Input, NumberInput, Grid, GridItem, Box, Button, Checkbox, Select,
  NumberInputField, NumberIncrementStepper, NumberDecrementStepper, NumberInputStepper
} from '@chakra-ui/react'
import EditableTags from './EditableTags';

/**  */
export default function EditorProperties({id, item, itemSchema, setConfig, setEditItem, bg, color}) {

  const editField = (itemDefn, name, value) => {
    const itemKey = id + '-' + name + '-edit-ctrl'
    switch (itemDefn.type) {
      case 'string': return <Input key={itemKey} size='sm'
          defaultValue={value}
          onChange={ev => { item[name] = ev.target.value; setConfig() }}
        />
      case 'url': return <Input key={itemKey} size='sm'
          defaultValue={value}
          onChange={ev => { item[name] = ev.target.value; setConfig() }}
        />
      case 'number': return <NumberInput key={itemKey} size='sm'
          defaultValue={value}
          onChange={value => { item[name] = value; setConfig() }}
        >
          <NumberInputField />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      case 'boolean': return <Checkbox key={itemKey} size='sm'
        isChecked={value}
        onChange={ev => { item[name] = ev.target.checked; setConfig() }}
        />
      case 'color': return <Input key={itemKey} size='sm'
        defaultValue={value}
        onChange={ev => { item[name] = ev.target.value; setConfig() }}
      />
    case 'list':
        if (itemDefn.closed && itemDefn.values) {
          return <Select key={itemKey} size='sm'>
            {itemDefn.values.map((value, index) => {
              <option value={index}>{value}</option>
            })}
          </Select>
        } else {
          <EditableTags key={itemKey} tags={value} setTags={tags => {
            item[name] = tags
          }}/>
        }
      case 'object': return <Button key={itemKey} size='sm'
        onClick={() => setEditItem({itemDefn: itemDefn, item: item, name: name, value: value})}
        >Edit</Button>
      case 'text': return <Button key={itemKey} size='sm'
        onClick={() => setEditItem({itemDefn: itemDefn, item: item, name: name, value: value})}
        >Edit</Button>
      case 'image': return <Button key={itemKey} size='sm'
        onClick={() => setEditItem({itemDefn: itemDefn, item: item, name: name, value: value})}
        >Edit</Button>
      default:
        console.warn(`Unnexpected config value type: ${itemDefn.type}`)
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
        const itemDefn = itemSchema[name]
        if (itemDefn.hidden) {
          return null
        }
        const value = item[name]
        return [
          <GridItem key={`${id}-${name}-label`} color={color} bg={bg}><Box>{name}</Box></GridItem>,
          <GridItem key={`${id}-${name}-edit`} color={color} bg={bg}>{editField(itemDefn, name, value)}</GridItem>
        ]
      }).flat()}
      </Grid>
  }
}
