import { useEffect } from 'react'

// Component to manage pushing content to the server
export default function PollPutContent({controller, adminConfig, contentToPut, setPutContentComplete, setUploadError}) {

  useEffect(() => {
    console.log(`Create put content poller`)
    const putContentWorker = setInterval(async () => {
      await Promise.all(Object.keys(contentToPut.current).map(async toPutId => {
        const toPut = contentToPut.current[toPutId]
        if (toPut.state === 'new') {
          toPut.state = 'working'
          const sourceRec = toPut.source[toPut.id]
          if (sourceRec) {
            console.log(`Push content to server for ${toPutId}`, sourceRec)
            try {
              if (sourceRec.isConfig) {
                await controller.putSiteConfig(
                    adminConfig.current.templateId,
                    toPutId,
                    toPut.contentType || sourceRec.contentType,
                    sourceRec.content
                )
              } else {
                await controller.putSiteContent(
                    adminConfig.current.templateId,
                    toPutId,
                    toPut.contentType || sourceRec.contentType,
                    sourceRec.content
                )
              }
              toPut.state = 'done'
              setUploadError(null)
              if (toPut.editorType === 'image') {
                setPutContentComplete(Date.now())
              }
            } catch (e) {
              console.error(`Upload failed for ${toPutId}`, toPut)
              toPut.state = 'failed'
              setUploadError(toPut.editorId)
              if (toPut.editorType === 'image') {
                setPutContentComplete(Date.now())
              }
            }
          }
        }
      }))
    }, 3 * 1000)
    return () => {
      console.log(`Remove put content poller`)
      clearInterval(putContentWorker)
    }
  }, [controller, adminConfig, contentToPut, setPutContentComplete, setUploadError])

}