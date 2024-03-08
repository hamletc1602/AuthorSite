import { useEffect } from 'react'

// Component to manage the lock state polling loop
export default function PollLockState({controller, authenticated, setLocked}) {

useEffect(() => {
  console.log(`Create lock state poller`)
  if (authenticated) {
    controller.getLockState().then(locked => setLocked(locked))
  }
  const lockStatePoller = setInterval(async () => {
      console.log('Poll for lock State')
      setLocked(await controller.getLockState())
    }, 4 * 60 * 1000)
    return () => {
      console.log(`Remove lock state poller.`)
      clearInterval(lockStatePoller)
    }
  }, [controller, authenticated, setLocked])
}