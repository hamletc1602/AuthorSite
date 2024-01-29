import { useEffect } from 'react'

// Component to manage the lock state polling loop
export default function PollLockState({controller, setLocked}) {

useEffect(() => {
  console.log(`Create lock state poller`)
  const lockStatePoller = setInterval(async () => {
      // Stop polling state when the page is not visible
      if (document.visibilityState !== "visible") {
          return
      }
      setLocked(await controller.getLockState())
    }, 4 * 60 * 1000)
    return () => {
      console.log(`Remove lock state poller.`)
      clearInterval(lockStatePoller)
    }
  }, [controller, setLocked])
}