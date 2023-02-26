import React, { } from 'react';
import {
    HStack, Spinner, Box,
    ModalContent, ModalHeader, ModalBody
} from '@chakra-ui/react'

/**  */
export default function PreparingTemplate({id, adminTemplates, adminConfig}) {
  const template = adminTemplates.find(p => p.id = adminConfig.templateId)
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
