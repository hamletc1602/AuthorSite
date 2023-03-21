import React from 'react';
import {
  Textarea, Skeleton
} from '@chakra-ui/react'

/**  */
export default function EditorText({id, content, fileContent, setData}) {
  const contentRec = fileContent.current[content]
  return <Skeleton w='100%' isLoaded={contentRec && contentRec.state !== 'pending'}>
    <Textarea
      key={'TextEdit_' + id}
      w='100%'
      h='15em'
      bg='white'
      color='editorText'
      defaultValue={contentRec ? contentRec.content : null}
      disabled={ ! contentRec}
      placeholder={contentRec ? null : 'Loading...'}
      onChangeCapture={ev => {
        fileContent.current[content] = {
          state: 'complete',
          content: ev.target.value,
          contentType: 'text/plain'
        }
        // Triggers content push, even if file path is unchanged
        setData('file', {
          name: content,
          delete: ev.target.value === ''
        })
      }}
    />
  </Skeleton>
}
