import { useEffect } from 'react'

// Component to manage pushing content to the server
export default function PollPutContent({controller, adminConfig, contentToPut, putContentComplete, setUploadError}) {

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
                  adminConfig.templateId,
                  toPutId,
                  toPut.contentType || sourceRec.contentType,
                  sourceRec.content
              )
              } else {
              await controller.putSiteContent(
                  adminConfig.templateId,
                  toPutId,
                  toPut.contentType || sourceRec.contentType,
                  sourceRec.content
              )
              }
              toPut.state = 'done'
              setUploadError(null)
              const update = Object.assign({}, putContentComplete.current)
              update[toPutId] = { succeeded: true }
              putContentComplete.current = update
            } catch (e) {
              console.error(`Upload failed for ${toPutId}`, toPut)
              toPut.state = 'failed'
              setUploadError(toPut.editorId)
              const update = Object.assign({}, putContentComplete.current)
              update[toPutId] = { succeeded: false }
              putContentComplete.current = update
            }
          }
        }
      }))
    }, 3 * 1000)
    return () => {
      console.log(`Remove put content poller`)
      clearInterval(putContentWorker)
    }
  }, [adminConfig, contentToPut, controller, putContentComplete, setUploadError])

}