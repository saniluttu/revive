import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import FirebaseMissing from './components/FirebaseMissing.jsx'
import './i18n/index.js'
import { firebaseReady, missingFirebaseVars } from './lib/firebase.js'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {firebaseReady ? (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    ) : (
      <FirebaseMissing missing={missingFirebaseVars} />
    )}
  </StrictMode>,
)
