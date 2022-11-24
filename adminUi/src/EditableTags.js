import React from 'react';
import {
  Editable, IconButton, ButtonGroup, HStack, useEditableControls, Tag
} from '@chakra-ui/react'
import { CheckIcon, CloseIcon, EditIcon } from '@chakra-ui/icons'

export default function EditableTags({key, tags, setTags}) {
  //
  function EditableControls() {
    const {
      isEditing,
      getSubmitButtonProps,
      getCancelButtonProps,
      getEditButtonProps,
    } = useEditableControls()

    return isEditing ? (
      <ButtonGroup size='xs'>
        <IconButton icon={<CheckIcon />} {...getSubmitButtonProps()} />
        <IconButton icon={<CloseIcon />} {...getCancelButtonProps()} />
      </ButtonGroup>
    ) : (
      <IconButton size='xs' icon={<EditIcon />} {...getEditButtonProps()} />
    )
  }

  return (
    <HStack>
      {tags.map((tag, index) => {
        <Tag key={key + index} size='sm'>{tag}</Tag>
      })}
      <Editable key={key + '-editable'} defaultValue='+ New tag'>
        <EditableControls />
      </Editable>
    </HStack>
  )
}
