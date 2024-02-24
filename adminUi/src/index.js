import React, { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './App';
import Controller from './Controller';

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
let lockId = null

// If there's a 'lock' param, put it's value in session store and reload to URL without the lock ID
//    (This keeps the URL clean of the lock ID, and ensures it's picked up by the Controller.)
if (window.location.search.indexOf('lock=') !== -1) {
  const url = new URL(window.location.href)
  if (url.searchParams.has('lock')) {
    lockId = url.searchParams.get('lock')
    sessionStorage.setItem('lockId', lockId)
    url.searchParams.delete('lock')
    window.location.href = url.toString()
  }
}

if ( ! lockId) {
  // Get or create lock ID, then remove it from the local session so it's not copied to duplicated tabs
  lockId = sessionStorage.getItem('lockId')
  if (lockId) {
    sessionStorage.removeItem('lockId')
  } else {
    lockId = String(Math.random()).substring(2,10) + String(Math.random()).substring(2,10)
  }
  // Save the current lock ID in local session just before page refresh, for use after refresh.
  window.addEventListener("beforeunload", () => {
    sessionStorage.setItem('lockId', lockId)
  })
  Controller.setLockId(lockId)
}

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
