import React, { useState, useCallback, useRef } from 'react';
import {
  Center
} from '@chakra-ui/react'
import {useDropzone} from 'react-dropzone'

/**  */
export default function EditorImage({key, content, fileContent, setData}) {

  const [cooldown, setCooldown] = useState(false)
  const imageUrl = useRef(null)

  const setImage = useCallback(() => {
    const rec = fileContent.current[content.file]
    if (rec && rec.state === 'complete') {
      const blob = new Blob([rec.content], { type: rec.contentType })
      imageUrl.current = URL.createObjectURL(blob)
    }
  }, [content, fileContent])

  setImage()

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
        setImage()
      })
    }
  }, [content, fileContent, setData, cooldown, setImage])
  const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop})

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} disabled={cooldown}/>
      {
        <Center
          key={'dropTarget_' + key}
          w='95%'  // This is a hack to keep right border from being clipped - Real problem is likely with the surrounding grid??
          minH='15em'
          margin='0.5em'
          color='yellow'
          textShadow='0 0 5px black, 0 0 8px white'
          bgImage={`url('${imageUrl.current}')`}
          bgRepeat='no-repeat'
          bgPosition='center top'
          bgSize='contain'
          border='2px dashed black'
        >{
          cooldown ?
            <p>Uploading...</p> :
            isDragActive ?
              <p>Drop the image file here ...</p> :
              <p>Drop an image file here or click to select files</p>
        }</Center>
      }
    </div>
 )
}