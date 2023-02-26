import React, { useState } from 'react';
import {
  Box, Input, HStack, Spinner,
  InputGroup, InputRightElement,
  ModalContent, ModalHeader, ModalBody
} from '@chakra-ui/react'
import {
  ViewIcon, ViewOffIcon, CheckIcon, NotAllowedIcon
  //QuestionOutlineIcon
} from '@chakra-ui/icons'

const authStates = {
  unknown: {
    //icon: <QuestionOutlineIcon m='6px 2px 2px 2px' color='red.600' verticalAlign='baseline' marginBottom={0} />
    icon: null
  },
  pending: {
    icon: <Spinner size="xs" m='6px 2px 2px 2px' verticalAlign='baseline' marginBottom={0} />
  },
  success: {
    icon: <CheckIcon m='6px 2px 2px 2px' color='green.300' verticalAlign='baseline' marginBottom={0} />
  },
  fail: {
    icon: <NotAllowedIcon m='6px 2px 2px 2px' color='red.300' verticalAlign='baseline' marginBottom={0} />
  }
}

/**  */
export default function Login({authState, passwordChanging}) {

  const [showPwd, setShowPwd] = useState(false)

  const viewPwdClick = () => {
    if ( ! showPwd) { // Pwd currently hidden, will be shown
      // Re-hide the password after 10s
      setTimeout(() => {
        setShowPwd(false)
      }, 10000)
    }
    setShowPwd(!showPwd)
  }

  return <ModalContent>
    <ModalHeader>
      <HStack spacing='5px' align='center'>
        <Box>Login</Box>
        <Box>{authStates[authState].icon}</Box>
      </HStack>
    </ModalHeader>
    <ModalBody>
      <InputGroup w='100%' size='sm' whiteSpace='nowrap' marginBottom='1em'>
        <Input
          type={showPwd ? 'text' : 'password'}
          color='text'
          placeholder='Password...'
          onChangeCapture={passwordChanging}
        />
        <InputRightElement color='text' onClick={viewPwdClick}>
          {showPwd ? <ViewIcon/> : <ViewOffIcon/>}
        </InputRightElement>
      </InputGroup>
    </ModalBody>
  </ModalContent>
}