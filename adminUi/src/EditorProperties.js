import React from 'react';
import {
  Input, NumberInput, Grid, GridItem, Box, Button, Checkbox, Select,
  NumberInputField, NumberIncrementStepper, NumberDecrementStepper, NumberInputStepper
} from '@chakra-ui/react'
//import EditableTags from './EditableTags';

/**  */
export default function EditorProperties({id, item, setConfig, setEditItem, bg, color}) {

  const editField = (schema, name, value) => {
    const itemKey = id + '-' + name + '-edit-ctrl'
    switch (schema.type) {
      case 'string': return <Input key={itemKey} size='sm'
          defaultValue={value}
          onChange={ev => { setConfig(item.path, name, ev.target.value) }}
        />
      case 'url': return <Input key={itemKey} size='sm'
          defaultValue={value}
          onChange={ev => { setConfig(item.path, name, ev.target.value) }}
        />
      case 'number': return <NumberInput key={itemKey} size='sm'
          defaultValue={value}
          onChange={value => { setConfig(item.path, name, value) }}
        >
          <NumberInputField />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      case 'boolean': return <Checkbox key={itemKey} size='sm'
        isChecked={value}
        onChange={ev => { setConfig(item.path, name, ev.target.checked) }}
        />
      case 'color': return <Input key={itemKey} size='sm'
        defaultValue={value}
        onChange={ev => { setConfig(item.path, name, ev.target.value) }}
      />
      case 'list':
        if (schema.closed && schema.values) {
          return <Select key={itemKey} size='sm'>
            {schema.values.map((value, index) => {
              return <option value={index}>{value}</option>
            })}
          </Select>
        } else {
          // TODO: Component not quite done
          // return <EditableTags key={itemKey} tags={value} setTags={tags => {
          //   setConfig(item.path, name, tags)
          // }}/>
          return null
        }
      case 'object': return <Button key={itemKey} size='sm'
        onClick={() => setEditItem({path: item.path, schema: schema, item: item, name: name, value: value})}
        >Edit</Button>
      case 'text': return <Button key={itemKey} size='sm'
        onClick={() => setEditItem({path: item.path, schema: schema, item: item, name: name, value: value})}
        >Edit</Button>
      case 'image': return <Button key={itemKey} size='sm'
        onClick={() => setEditItem({path: item.path, schema: schema, item: item, name: name, value: value})}
        >Edit</Button>
      default:
        console.warn(`Unnexpected config value type: ${schema.type}`)
    }
  }

  if (item) {
    const names = Object.keys(item.content)
    return <Grid
        templateAreas={`
        "edit edit"
      `}
      templateColumns={'10em 1fr'}
    >
      {names.map(name => {
        if ( ! (item.schema && item.schema[name])) {
          return null
        }
        const schema = item.schema[name]
        if (schema.hidden) {
          return null
        }
        const value = item.content[name]
        return [
          <GridItem key={`${id}-${name}-label`} color={color} bg={bg}><Box>{name}</Box></GridItem>,
          <GridItem key={`${id}-${name}-edit`} color={color} bg={bg}>{editField(schema, name, value)}</GridItem>
        ]
      }).flat()}
      </Grid>
  }
}
