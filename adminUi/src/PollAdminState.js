import { useEffect } from 'react'

// Component to manage the admin state polling loop
export default function PollAdminState({controller, intervalMs, setError, setAdminState}) {

  useEffect(() => {
    console.log(`Create admin state poller, interval: ${intervalMs}ms`)
    const adminStatePoller = setInterval(async () => {
      // Stop polling state when the page is not visible
      if (document.visibilityState !== "visible") {
        return
      }
      try {
        console.log(`Poll for admin state`)
        if (await controller.checkState()) {
          setAdminState(controller.getConfig())
        }
      } catch (error) {
        setError(error)
      }
    }, intervalMs)

    // Initial Check State on load.
    controller.checkState().then(async () => {
      setAdminState(controller.getConfig())
    })

    return () => {
      console.log(`Remove admin state poller.`)
      clearInterval(adminStatePoller)
    };
  }, [controller, intervalMs, setError, setAdminState])

}
