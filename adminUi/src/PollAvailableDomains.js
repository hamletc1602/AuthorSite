import { useEffect } from 'react'

// Component to manage the lock state polling loop
export default function PollAvailableDomains({controller, authenticated}) {

useEffect(() => {
  console.log(`Create available domains poller`)
  if (authenticated) {
    controller.sendCommand('getAvailableDomains')
  }
  const poller = setInterval(async () => {
      // Stop polling state when the page is not visible
      if (document.visibilityState !== "visible") {
          return
      }
      controller.sendCommand('getAvailableDomains')
    }, 4 * 60 * 1000)
    return () => {
      console.log(`Remove available domains poller.`)
      clearInterval(poller)
    }
  }, [controller, authenticated])
}