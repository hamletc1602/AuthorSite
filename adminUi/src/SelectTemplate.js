import React, { useEffect } from 'react';
import {
    Stack, Flex,
    ModalContent, ModalHeader, ModalBody, Skeleton
} from '@chakra-ui/react'
import TemplateCard from './TemplateCard'

/**  */
export default function SelectTemplate({controller, templates, setTemplate}) {

  useEffect(() => {
    controller.getTemplates().then(tplList => {
      templates.current = tplList
    })
  })
  const getTemplates = () => templates.current ? templates.current : []

  return <ModalContent>
    <ModalHeader>Select a template</ModalHeader>
    <ModalBody>
      <Skeleton isLoaded={getTemplates()} hidden={getTemplates()} height='10em'/>
      <Flex overflow="auto">
        <Stack>
          {getTemplates().map(tpl => {
            return <TemplateCard
              key={tpl.id}
              id={tpl.id}
              title={tpl.name}
              text={tpl.description ? tpl.description : 'A cool template'}
              button='Select Template'
              onClick={() => setTemplate(tpl.id)}
            />
          })}
        </Stack>
      </Flex>
    </ModalBody>
  </ModalContent>
}
