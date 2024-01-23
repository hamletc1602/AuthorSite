import React, { } from 'react';
import {
    HStack, Spinner, Box,
    ModalContent, ModalHeader, ModalBody
} from '@chakra-ui/react'

/**  */
export default function ChangingDomain({id}) {
  return <ModalContent>
    <ModalHeader>
      <HStack spacing='5px' align='center'>
        <Box>Changing Domain</Box>
        <Box><Spinner size='sm'/></Box>
      </HStack>
    </ModalHeader>
    <ModalBody>
      Switching site to the new domain...
    </ModalBody>
  </ModalContent>
}
