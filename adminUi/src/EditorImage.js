import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Center
} from '@chakra-ui/react'
import Util from './Util'
import {useDropzone} from 'react-dropzone'

/**  */
export default function EditorImage({id, path, content, fileContent, setData, putContentComplete}) {

  const [cooldown, setCooldown] = useState(false)
  const imageUrl = useRef(null)

  const setImage = useCallback(() => {
    const rec = fileContent.current[content]
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
      const mimeType = files[0].type
      console.log(`Found file: ${files[0].name}. Size: ${files[0].size}. Type: ${mimeType}`)

      // HACK: Update the content path with the mime type of the uploaded file, to ensure the builder works (which
      // relies on specific .png and .jpg extensions to load files)
      let ext = null
      switch (mimeType) {
        case 'image/jpeg':
          ext = '.jpg'
          break
        case 'image/png':
          ext = '.png'
          break
        default: // empty
      }
      if (ext === null) {
        // TODO: Need friendly UI to reject non-PNG or JPG image types.
        console.error(`Image type ${mimeType} uploaded in not an accepted image type. Rquires PNG or JPEG`)
        return
      }
      let newContent = content
      if (content !== null) {
        const parts = content.split('.')
        const currExt = '.' + parts[parts.length - 1]
        if (currExt !== ext) {
          newContent = content.replace(currExt, ext)
        }
      } else {
        newContent = Util.createFilePath(path, ext)
      }

      //
      files[0].arrayBuffer().then(fileBuffer => {
        fileContent.current[newContent] = {
          state: 'complete',
          content: fileBuffer,
          contentType: mimeType
        }

        // Parse the image file to get width and height
        const image = new Image();
        image.addEventListener('load', () => {
          // Triggers content push, even if file path is unchanged
          setData('file', {
            name: newContent,
            type: mimeType,
            width: image.width,
            height: image.height
          })
        });

        // Show the dropped image
        image.src = URL.createObjectURL(new Blob([fileBuffer], { type: mimeType }))
        setImage()

        // Disable the input while uploading
        //     Provide a hard timeout here of 10 minutes, in case something goes wrong with
        setCooldown(true)
        setTimeout(() => {
          console.log(`Cancel upload cooldown for ${content} after 10 minutes.`)
          setCooldown(false)
        }, 10 * 60 * 1000)
      })
    }
  }, [path, content, fileContent, setData, cooldown, setImage])
  const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop})

  useEffect(() => {
    if (putContentComplete === content) {
      console.log(`File upload complete for ${content}`)
      setCooldown(false)
    }
  }, [putContentComplete, content, setCooldown])

  // Text outline props
  const ow = 1
  const ocolor = 'lightgray'

  return (
    <div {...getRootProps()} style={{ width: '100%'}}>
      <input {...getInputProps()} disabled={cooldown}/>
      {
        <Center
          key={'dropTarget_' + id}
          w='95%'  // This is a hack to keep right border from being clipped - Real problem is likely with the surrounding grid??
          minH='15em'
          margin='0.5em'
          color='black'
          textShadow={`${ow}px 0px 1px ${ocolor}, -${ow}px -0px 1px ${ocolor}, 0px ${ow}px 1px ${ocolor}, 0px -${ow}px 1px ${ocolor}`}
          bg={ocolor}
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