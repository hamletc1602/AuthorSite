import React, { } from 'react';
import {
    HStack, Spinner, Box,
    ModalContent, ModalHeader, ModalBody
} from '@chakra-ui/react'

/**  */
export default function PreparingTemplate({templates, adminConfig}) {
  const getTemplates = () => templates.current ? templates.current : []
  const template = getTemplates().find(p => p.id === adminConfig.current.templateId)
  return <ModalContent>
    <ModalHeader>
      <HStack spacing='5px' align='center'>
        <Box>Preparing</Box>
        <Box><Spinner size='sm'/></Box>
      </HStack>
    </ModalHeader>
    <ModalBody>
      Preparing {template.name} template.
    </ModalBody>
  </ModalContent>
}
