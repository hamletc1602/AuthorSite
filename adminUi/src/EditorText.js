import React from 'react';
import {
  Textarea, Skeleton
} from '@chakra-ui/react'

/**  */
export default function EditorText({key, content, fileContent, setData}) {
  const contentRec = fileContent.current[content.file]
  return <Skeleton isLoaded={contentRec && contentRec.state !== 'pending'}>
    <Textarea
      key={'TextEdit_' + key}
      bg='white'
      color='brand.editorText'
      defaultValue={contentRec ? contentRec.content : null}
      disabled={ ! contentRec}
      placeholder={contentRec ? null : 'Loading...'}
      onChangeCapture={ev => {
        fileContent.current[content.file] = {
          state: 'complete',
          content: ev.target.value,
          contentType: 'text/plain'
        }
        // Triggers content push, even if file path is unchanged
        setData('file', content.file)
      }}
    />
  </Skeleton>
}
