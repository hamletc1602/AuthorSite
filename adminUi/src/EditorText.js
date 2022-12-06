import React from 'react';
import {
  Textarea, Skeleton
} from '@chakra-ui/react'

/**  */
export default function EditorText({id, content, fileContent, dispatchFileContent, setData}) {
  const contentRec = fileContent[content.file]
  return <Skeleton isLoaded={contentRec && contentRec.state !== 'pending'}>
    <Textarea
      key={id}
      bg='white'
      color='brand.editorText'
      defaultValue={content}
      onChangeCapture={ev => {
        dispatchFileContent({
          path: content.file,
          content: {
            state: 'complete',
            content: ev.target.value,
            contentType: 'text/plain'
          }
        })
        // Triggers content push, even if file path is unchanged
        setData('file', content.file)
      }}
    />
  </Skeleton>
}
