import React, { useRef } from 'react';
import {
  Center, Button
} from '@chakra-ui/react'
import useFileUpload from 'react-use-file-upload';
//import Editor from './Editor';

/**  */
export default function EditorImage({key, content, fileContent, setData}) {
  const {
    files,
    //fileNames,
    fileTypes,
    //totalSize,
    //totalSizeInBytes,
    handleDragDropEvent,
    //clearAllFiles,
    //createFormData,
    setFiles,
    //removeFile,
  } = useFileUpload()

  const inputRef = useRef();

  const handleUpload = React.useCallback((e) => {
      setFiles(e, 'w');
      setTimeout(() => {
        if (files.length > 0) {
          console.log(`Found file: ${files[0].name}. Size: ${files[0].size}`)
          files[0].arrayBuffer().then(fileBuffer => {
            fileContent.current[content.file] = {
              state: 'complete',
              content: fileBuffer,
              contentType: fileTypes[0]
            }
            // Triggers content push, even if file path is unchanged
            setData('file', content.file)
          })
        }
      }, 5000)
  }, [setFiles, files, fileTypes, content, fileContent, setData])

  return (
    <div css={CSS}>
      <div className="form-container">
        <div
          //css={}
          onDragEnter={handleDragDropEvent}
          onDragOver={handleDragDropEvent}
          onDrop={(e) => {
            handleDragDropEvent(e);
            handleUpload(e)
          }}
        >
          <Center
            key={'dropTarget_' + key}
            h='10em'
            w='20em'
            bg='gray.200'
            margin='0.5em'
          >
            <p>Drag and drop image here</p>
          </Center>
          <Center
            key={'uploadButton_' + key}
            w='20em'
            margin='0.5em'
          >
            <Button onClick={() => inputRef.current.click()}>Or select an image to upload</Button>
          </Center>

          {/* Hide the default HTML input */}
          <input
            ref={inputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              handleUpload(e)
              inputRef.current.value = null
            }}
          />
        </div>
      </div>
    </div>
  )
}