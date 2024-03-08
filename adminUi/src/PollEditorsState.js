import { useEffect } from 'react'

// Component to manage the client side representation of the editots state.
//    This is only in avtive polling until the editors state for a given template is loaded, then it sits quiet.
export default function PollEditorsState({
  templateId, controller, authenticated, setPath, configs, editors, setEditorsEnabled, setShowPreparingTemplate
}) {
  // Get config data from the server
  useEffect(() => {

    async function getEditors() {
      try {
        if (authenticated && editors.current.length === 0) {
          // If a template ID is saved in the admin state, also pull the list of editors from the server
          if (templateId) {
            console.log(`Update Editor config data from server. Template: ${templateId}`)
            controller.getEditors(templateId)
              .then(async editorsData => {
                if (editorsData) {
                  const editorId = editorsData[0].id
                  // Init local editor data values
                  editorsData = editorsData.map(editor => {
                    editor.lastEditPath = [{ name: editor.id }]
                    return editor
                  })
                  const raw = await controller.getSiteConfig(templateId, editorId)
                  raw.content.contentType = raw.contentType // Copy response content-type to content for later use.
                  raw.content.isConfig = true // Add config flag, for use later in uploading.
                  configs.current[editorId] = raw.content
                  editors.current = editorsData
                  setPath([{ name: editorId }])
                  setEditorsEnabled(true)
                  setShowPreparingTemplate(false)
                }
              })
          }
        }
      } catch (error) {
        console.error('Failed Get editors init.', error)
      }
    }

    console.log(`Create get editors state poller`)
    getEditors()
    const poller = setInterval(async () => {
      getEditors()
    }, 1000)
    return () => {
      console.log(`Remove get editors state poller.`)
      clearInterval(poller)
    }
  }, [authenticated, templateId, controller, configs, editors, setPath, setEditorsEnabled, setShowPreparingTemplate])
}
