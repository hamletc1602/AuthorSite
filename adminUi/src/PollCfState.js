import { useEffect } from 'react'

// Component to manage the lock state polling loop
export default function PollCfState({controller, domains, authenticated}) {

        // // Async invoke a check of CloudFront Distro state so we can give feedback to the user about when it's
        // // possible to request changes.
        // invokeAdminWorker('checkCfDistroState', arnPrefix + '-admin-worker', {
        //   domains: {
        //     main: resp.state.state.domains.base,
        //     test: resp.state.state.domains.baseTest
        //   }
        // })

useEffect(() => {
  console.log(`Create CF State poller`)
  const params = {
    domains: {
      main: domains.base,
      test: domains.baseTest
    }
  }
  if (authenticated) {
    controller.sendCommand('checkCfDistroState', params)
  }
  const poller = setInterval(async () => {
      // Stop polling state when the page is not visible
      if (document.visibilityState !== "visible") {
          return
      }
      console.log('Poll for CF State')
      controller.sendCommand('checkCfDistroState', params)
    }, 30 * 1000)
    return () => {
      console.log(`Remove CfState poller.`)
      clearInterval(poller)
    }
  }, [controller, domains, authenticated])
}