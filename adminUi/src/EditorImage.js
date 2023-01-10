import React, { useState, useCallback } from 'react';
import {
  Center
} from '@chakra-ui/react'
import {useDropzone} from 'react-dropzone'

/**  */
export default function EditorImage({key, content, fileContent, setData}) {

  const [cooldown, setCooldown] = useState(false)

  const onDrop = useCallback(files => {
    if (files.length > 0) {
      if (cooldown) {
        console.log(`In cooldown, skip upload for file: ${files[0].name}. Size: ${files[0].size}`)
        return
      }
      console.log(`Found file: ${files[0].name}. Size: ${files[0].size}`)
      files[0].arrayBuffer().then(fileBuffer => {
        fileContent.current[content.file] = {
          state: 'complete',
          content: fileBuffer,
          contentType: files[0].type
        }
        // Triggers content push, even if file path is unchanged
        setData('file', content.file)
        setCooldown(true)
        setTimeout(() => {
          // TODO: Tie this in to the actual file upload process rather than a static timeout
          //  OR: Add and instance key to make the multipart upload less sensitive to overlapping uploads?
          setCooldown(false)
        }, 10000)
      })
    }
  }, [content, fileContent, setData, cooldown])
  const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop})

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} disabled={cooldown} />
      {
        <Center
          key={'dropTarget_' + key}
          h='10em'
          w='20em'
          bg='gray.200'
          margin='0.5em'
        >{
          cooldown ?
            <p>Uploading...</p> :
            isDragActive ?
              <p>Drop the files here ...</p> :
              <p>Drag 'n' drop some files here, or click to select files</p>
        }</Center>
      }
    </div>
 )
}