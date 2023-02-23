import React, { Card, CardBody, CardFooter } from 'react';
import {
  Stack, Button, Text, Heading, Image
} from '@chakra-ui/react'

/**  */
export default function TemplateCard({id, title, text, button}) {
  return <Card
    direction={{ base: 'column', sm: 'row' }}
    overflow='hidden'
    variant='outline'
  >
    <Image
      objectFit='cover'
      maxW={{ base: '100%', sm: '200px' }}
      src=''
      alt=''
    />
    <Stack>
      <CardBody>
        <Heading size='md'>{title}</Heading>
        <Text py='2'>{text}</Text>
      </CardBody>
      <CardFooter>
        <Button variant='solid' colorScheme='blue'>{button}</Button>
      </CardFooter>
    </Stack>
  </Card>
}