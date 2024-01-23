import React from 'react';
import {
  Button, Tooltip
} from '@chakra-ui/react'

/**  */
export default function ActionButton({
    id, text, onClick, w, tooltip, errorFlag, errorText, buttonStyle, disabled, isLoading, loadingText
  }) {
  id = id || text
  buttonStyle = buttonStyle || {}
  if (buttonStyle.size === 'xs') {
    buttonStyle.height = '1.5em'
  }
  return <Tooltip key={id + '-tip'}
      openDelay={tooltip.openDelay || 650} closeDelay={tooltip.closeDelay || 250} hasArrow={true} placement={tooltip.placement}
      label={errorFlag ? errorText : tooltip.text} aria-label={errorFlag ? errorText : tooltip.text}
    >
      <Button key={id + '-btn'} onClick={onClick} w={w}
          size={buttonStyle.size || 'sm'} h={buttonStyle.height} m={buttonStyle.margin || '0 0.5em'}
          color='accent' _hover={{ bg: 'gray.400' }} bg={errorFlag ? 'danger' : 'accentText'}
          disabled={disabled} isLoading={isLoading} loadingText={loadingText}
      >{text}</Button>
    </Tooltip>
}
