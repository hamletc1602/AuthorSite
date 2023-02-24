import React, { } from 'react';
import {
  //Card, CardBody, CardFooter,   // Something very weird about the import of Card, React can't find it??
  //Stack, Button, Text, Heading, Image
  Link
} from '@chakra-ui/react'

/**  */
export default function TemplateCard({id, title, text, button, onClick}) {

  // Workaround, since 'Card' import can't be located?? Just return a link to click.
  return <Link id={id} onClick={onClick}>{title}</Link>

  // return <Card
  //   key={id}
  //   direction={{ base: 'column', sm: 'row' }}
  //   overflow='hidden'
  //   variant='outline'
  // >
  //   <Image
  //     objectFit='cover'
  //     maxW={{ base: '100%', sm: '200px' }}
  //     src=''
  //     alt=''
  //   />
  //   <Stack>
  //     <CardBody>
  //       <Heading size='md'>{title}</Heading>
  //       <Text py='2'>{text}</Text>
  //     </CardBody>
  //     <CardFooter>
  //       <Button id={id} variant='solid' colorScheme='blue' onClick={onClick}>{button}</Button>
  //     </CardFooter>
  //   </Stack>
  // </Card>
}