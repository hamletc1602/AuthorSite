import React, {  } from 'react';
import {
  Input, NumberInput, Grid, GridItem, Button, Checkbox, Select, Tooltip,
  NumberInputField, NumberIncrementStepper, NumberDecrementStepper, NumberInputStepper
} from '@chakra-ui/react'
//import EditableTags from './EditableTags';

/**  */
export default function EditorProperties({id, content, schema, setData, editItem, advancedMode}) {

  // Upate item content values on control changes
  function editField(schema, name, value) {
    const itemKey = id + '-' + name + '-edit-ctrl'
    switch (schema.type) {
      case 'string': return <Input key={itemKey} size='sm'
          defaultValue={value}
          onChange={ev => { setData(name, ev.target.value) }}
        />
      case 'url': return <Input key={itemKey} size='sm'
          defaultValue={value}
          onChange={ev => { setData(name, ev.target.value) }}
        />
      case 'number': return <NumberInput key={itemKey} size='sm'
          defaultValue={value}
          onChange={value => { setData(name, value) }}
        >
          <NumberInputField />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      case 'boolean': return <Checkbox key={itemKey} size='sm'
        isChecked={value}
        onChange={ev => { setData(name, ev.target.checked) }}
        />
      case 'color': return <Input key={itemKey} size='sm'
        defaultValue={value}
        onChange={ev => { setData(name, ev.target.value) }}
      />
      case 'list':
        if (schema.closed && schema.values) {
          let selIndex = -1
          if (value && value.length > 0) {
            selIndex = schema.values.findIndex(p => p === value[0])
          }
          return <Select key={itemKey} size='sm'
            defaultValue={selIndex}
            onChange={ev => { setData(name, [schema.values[ev.target.value]]) }}
          >
            {schema.values.map((listValue, index) => {
              return <option key={itemKey + '_opt' + index} value={index}>{listValue}</option>
            })}
          </Select>
        } else if (schema.elemType !== 'string') {
          // Lists of any type but 'string' need an edit button
          return <Button key={itemKey} size='sm'
              onClick={() => editItem(name)}
            >Edit</Button>
        } else {
          // TODO: Component not quite done. Maybe Use a comma-sep list for now, but continue to store as
          //    an array.
          // return <EditableTags key={itemKey} tags={value} setTags={tags => {
          //   setConfig(item.path, name, tags)
          // }}/>
          return <Input key={itemKey} size='sm'
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
      case 'object': return <Button key={itemKey} size='sm'
          onClick={() => editItem(name)}
        >Edit</Button>
      case 'text': return <Button key={itemKey} size='sm'
          onClick={() => editItem(name)}
        >Edit</Button>
      case 'image': return <Button key={itemKey} size='sm'
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
      templateAreas={`
      "edit edit"
    `}
    templateColumns={'12em 1fr'}
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
