import React, { } from 'react';
import {
    Stack,
    ModalContent, ModalHeader, ModalBody, Skeleton
} from '@chakra-ui/react'
import TemplateCard from './TemplateCard'

/**  */
export default function SelectTemplate({id, adminTemplates, setTemplateId}) {
  return <ModalContent>
    <ModalHeader>Select a template</ModalHeader>
    <ModalBody>
      <Skeleton isLoaded={adminTemplates} hidden={adminTemplates} height='10em'/>
      <Stack>
        {adminTemplates.map(tpl => {
          return <TemplateCard
            key={tpl.id}
            id={tpl.id}
            title={tpl.name}
            text={tpl.description ? tpl.description : 'A cool template'}
            button='Select Template'
            onClick={() => setTemplateId(tpl.id)}
          />
        })}
      </Stack>
    </ModalBody>
  </ModalContent>
}
