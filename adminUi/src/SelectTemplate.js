import React, { useEffect } from 'react';
import {
    Box, Flex, Button, SimpleGrid, Spacer,
    ModalContent, ModalHeader, ModalBody, Skeleton,
    Accordion, AccordionItem, AccordionButton, AccordionPanel, AccordionIcon
} from '@chakra-ui/react'
//import TemplateCard from './TemplateCard'

/**  */
export default function SelectTemplate({controller, templates, setTemplate, setShowModal}) {

  useEffect(() => {
    controller.getTemplates().then(tplList => {
      templates.current = tplList
    })
  })
  const getTemplates = () => templates.current ? templates.current : []
  const getFilteredTemplates = (filterVal) => getTemplates().filter(p => p.access === filterVal)

  const doSelectTemplate = (tplId) => {
    setTemplate(tplId)
  }

  return <ModalContent>
    <ModalHeader>Select a template</ModalHeader>
    <ModalBody>
      <Skeleton isLoaded={getTemplates()} hidden={getTemplates()} height='10em'/>
      <Flex overflow="auto">
        <Accordion w='40em'>
          {['public', 'shared', 'private'].map(tplType => {
            return <AccordionItem>
              <h2>
                <AccordionButton>
                  <Box as="span" flex='1' textAlign='left'>
                    <span style={{fontWeight: 'bolder', textTransform: 'capitalize'}}>
                      {tplType} ({getFilteredTemplates(tplType).length})
                    </span>
                  </Box>
                  <AccordionIcon />
                </AccordionButton>
              </h2>
              <AccordionPanel pb={4}>
                <SimpleGrid columns={3} spacing={5}>
                  {getFilteredTemplates(tplType).map(tpl => {
                    return <Box key={tpl.id} onClick={() => doSelectTemplate(tpl.id)} style={{cursor: 'pointer'}}>
                        <span style={{fontWeight: 'bold'}}>{tpl.name}: </span>
                        <span>{tpl.description}</span>
                      </Box>
                  })}
                </SimpleGrid>
              </AccordionPanel>
            </AccordionItem>
          })}
        </Accordion>

          {/* <TemplateCard
              key={tpl.id}
              id={tpl.id}
              title={tpl.name}
              text={tpl.description ? tpl.description : 'A cool template'}
              button='Select Template'
              onClick={() => setTemplate(tpl.id)}
            /> */}

      </Flex>
      <Flex style={{marginTop: '10px'}}>
        <Spacer/>
        <Button onClick={() => setShowModal(false)}>Close</Button>
      </Flex>
    </ModalBody>
  </ModalContent>
}
