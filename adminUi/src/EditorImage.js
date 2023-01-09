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

  function arrayBufferToBase64( buffer ) {
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return btoa( binary );
  }

  const handleUpload = (e) => {
    setFiles(e, 'w');
    setTimeout(async () => {
      fileContent.current[content.file] = {
          state: 'complete',
          content: arrayBufferToBase64(await files[0].arrayBuffer()),
          contentType: fileTypes[0]
        }
      // Triggers content push, even if file path is unchanged
      setData('file', content.file)
    }, 1000)
  }

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
            h='10em'
            w='20em'
            bg='gray.200'
            margin='0.5em'
          >
            <p>Drag and drop image here</p>
          </Center>
          <Center
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