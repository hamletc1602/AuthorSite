import React, { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './App';
import Controller from './Controller';

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);

// Get or create lock ID, then remove it from the local session so it's not copied to duplicated tabs
let lockId = sessionStorage.getItem('lockId')
if (lockId) {
  sessionStorage.removeItem('lockId')
} else {
  lockId = String(Math.random()).substring(2,10) + String(Math.random()).substring(2,10)
}
// Save the current lock ID in local session just before page refresh, for use after refresh.
window.addEventListener("beforeunload", () => {
  console.log('On Unload!')
  sessionStorage.setItem('lockId', lockId)
})
Controller.setLockId(lockId)

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
