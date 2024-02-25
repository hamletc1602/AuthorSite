import React, { useRef, useEffect } from 'react';
import {
    HStack, VStack, Text, Select, Button, Input, Textarea, Spacer,
    PopoverBody, PopoverContent, PopoverArrow, useMergeRefs
} from '@chakra-ui/react'

/**  */
export default function ManageTemplatesPopup({
  id, templates, headerText, controller, setDisplay, startFastPolling, onClose,
  focus, error, errorMsg, advancedMode
}) {
  const tplNameSelect = useRef({})
  const tplNameInput = useRef({})
  const tplDescInput = useRef({})
  const tplSaveBtn = useRef({})
  const tplDeleteBtn = useRef({})
  const tplRenameBtn = useRef({})

  const tplNameInputWithFocus = useMergeRefs(focus, tplNameInput)

  useEffect(() => {
    controller.getTemplates().then(tplList => {
      templates.current = tplList
    })
  })

  const getTemplates = () => templates.current ? templates.current : []

  const doSaveTemplate = () => {
    setDisplay('saveTpl', true)
    controller.sendCommand('saveTemplate', {
      id: id,
      name: tplNameInput.current.value || tplNameSelect.current.value,
      desc: tplDescInput.current.value || `A saved settings bundle for template ${id}`,
      overwrite: advancedMode
    })
    startFastPolling()
  }

  const doDeleteTemplate = () => {
    setDisplay('delTpl', true)
    controller.sendCommand('deleteTemplate', {
      name: tplNameSelect.current.value
    })
    startFastPolling()
  }

  const doRenameTemplate = () => {
    setDisplay('renTpl', true)
    controller.sendCommand('renameTemplate', {
      name: tplNameSelect.current.value,
      toName: tplNameInput.current.value
    })
    startFastPolling()
  }

  return <PopoverContent>
    <PopoverArrow />
    <PopoverBody>
      <Text>{error ? headerText + '<br><br>' + errorMsg : headerText}</Text>
      <Select ref={tplNameSelect} size='sm' autoFocus={false} defaultValue={templates[0]} onChange={ev => {
          const tplName = ev.target.value
          const tpl = getTemplates().find(p => p.id === tplName)
          if (tplName === '') {
            tplDeleteBtn.current.disabled = true
            tplRenameBtn.current.disabled = true
          } else {
            tplDeleteBtn.current.disabled = false
            tplRenameBtn.current.disabled = false
            tplDescInput.current.value = tpl.description
          }
        }}
      >
        <option key={-1} value={''} align='right'>New template...</option>,
        {getTemplates().map((tpl, index) => {
          return <option key={index} value={tpl.name} align='right'>{tpl.name}</option>
        })}
      </Select>
      <HStack margin='0.5em 0'>
        <Text>Name:</Text><Input ref={tplNameInputWithFocus} size='xs'></Input>
      </HStack>
      <VStack margin='0.5em 0' align='start'>
        <Text>Description:</Text>
        <Textarea ref={tplDescInput} size='xs'/>
      </VStack>
      <HStack>
        <Spacer/>
        <Button size='xs' onClick={onClose}>Cancel</Button>
        <Button ref={tplDeleteBtn} size='xs' disabled={true} onClick={() => {doDeleteTemplate(); onClose()}}>Delete</Button>
        <Button ref={tplRenameBtn} size='xs' disabled={true} onClick={() => {doRenameTemplate(); onClose()}}>Rename</Button>
        <Button ref={tplSaveBtn} size='xs' onClick={() => {doSaveTemplate(); onClose()}}>Save</Button>
      </HStack>
    </PopoverBody>
  </PopoverContent>
}
