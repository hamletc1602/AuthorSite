import React, {  } from 'react';
import {
  Box, Input, NumberInput, Grid, GridItem, Button, Checkbox, Select, Tooltip,
  NumberInputField, NumberIncrementStepper, NumberDecrementStepper, NumberInputStepper
} from '@chakra-ui/react'
//import EditableTags from './EditableTags';

/**  */
export default function EditorProperties({id, content, schema, setData, editItem, advancedMode, locked}) {

  // Upate item content values on control changes
  function editField(schema, name, value) {
    const itemKey = id + '-' + name + '-edit-ctrl'
    switch (schema.type) {
      case 'string': return <Input key={itemKey} size='sm'
          defaultValue={value} disabled={locked}
          onChange={ev => { setData(name, ev.target.value) }}
        />
      case 'url': return <Input key={itemKey} size='sm'
          defaultValue={value} disabled={locked}
          onChange={ev => { setData(name, ev.target.value) }}
        />
      case 'number': return <NumberInput key={itemKey} size='sm'
          defaultValue={value} disabled={locked}
          onChange={value => { setData(name, value) }}
        >
          <NumberInputField />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      case 'boolean': return <Checkbox key={itemKey} size='sm'
        defaultChecked={value} disabled={locked}
        onChange={ev => {
          setData(name, ev.target.checked)
        }}
        />
      case 'color': return <Input key={itemKey} size='sm'
        defaultValue={value} disabled={locked}
        onChange={ev => { setData(name, ev.target.value) }}
      />
      case 'list':
        if (schema.closed && schema.values && schema.multi) {
          // TODO: Multi-select list is not yet implemented
          // UI will likely be a checkboxes group??
          return <Box>{'Multi-select list input is not yet available'}</Box>
        } else if (schema.closed && schema.values) {
          let selIndex = -1
          if (value) {
            selIndex = schema.values.findIndex(p => p === value)
          }
          return <Select key={itemKey} size='sm'
            defaultValue={selIndex} disabled={locked}
            onChange={ev => { setData(name, schema.values[ev.target.value]) }}
          >
            {schema.values.map((listValue, index) => {
              return <option key={itemKey + '_opt' + index} value={index}>{listValue}</option>
            })}
          </Select>
        } else if (schema.elemType !== 'string') {
          // Lists of any type but 'string' need an edit button
          return <Button key={itemKey} size='xs' bg='accentLighter' color='accentText'
              _hover={{ bg: 'accent', color: 'gray.400'}}
              onClick={() => editItem(name)}
            >Edit</Button>
        } else {
          // TODO: Component not quite done. Maybe Use a comma-sep list for now, but continue to store as
          //    an array.
          // return <EditableTags key={itemKey} tags={value} setTags={tags => {
          //   setConfig(item.path, name, tags)
          // }}/>
          return <Input key={itemKey} size='sm' disabled={locked}
            defaultValue={(value && value.join) ? value.join(", ") : value}
            onChange={ev => {
              let v = ev.target.value
              if (ev.target.value) {
                v = ev.target.value.split(',')
                v = v.map(i => i.trim())
              }
              setData(name, v)
            }}
          />
        }
      case 'object': return <Button key={itemKey} size='xs' bg='accentLighter' color='accentText'
          _hover={{ bg: 'accent', color: 'gray.400'}}
          onClick={() => editItem(name)}
        >Edit</Button>
      case 'text': return <Button key={itemKey} size='xs' bg='accentLighter' color='accentText'
          _hover={{ bg: 'accent', color: 'gray.400'}} disabled={locked}
          onClick={() => editItem(name)}
        >Edit</Button>
      case 'image': return <Button key={itemKey} size='xs' bg='accentLighter' color='accentText'
          _hover={{ bg: 'accent', color: 'gray.400'}} disabled={locked}
          onClick={() => editItem(name)}
        >Edit</Button>
      default:
        console.warn(`Unnexpected config value type: ${schema.type}`)
    }
  }

  let properties = null
  if (schema.dynamicProperties && schema.dynamicProperties.cache) {
    // If this schema has any dynamic properties, merge them into the properties set before rendering
    properties = Object.assign({}, schema.properties, schema.dynamicProperties.cache)
  } else {
    properties = schema.properties
  }
  const names = Object.keys(properties)
  return <Grid
    key={'PropsEdit' + id}
    w='100%'
    maxHeight={(names.length * 2) + 'em'}
    templateAreas={`"edit edit"`}
    templateColumns={'12em 1fr'}
    rowGap={0}
    color='editorText'
    bg='editor'
  >
    {names.map(name => {
      const itemSchema = properties[name]
      if ( ! advancedMode && itemSchema.hidden) {
        return null
      }
      if (content === undefined || content === null || content.length === 0) {
        return null
      }
      const value = content[name]
      return [
        <GridItem key={`${id}-${name}-label`} >
          <Tooltip openDelay={450} closeDelay={250} label={itemSchema.desc} hasArrow={true} aria-label={itemSchema.desc}>
            {itemSchema.disp || name}
          </Tooltip>
        </GridItem>,
        <GridItem key={`${id}-${name}-edit`}>
          {editField(itemSchema, name, value)}
        </GridItem>
      ]
    }).flat()}
    </Grid>
}
