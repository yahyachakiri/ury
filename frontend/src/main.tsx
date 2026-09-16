import './index.css'

import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom'
import { StrictMode } from 'react'
import { ToastProvider } from '@ury/ui'
import { createRoot } from 'react-dom/client'
import { initFrontendI18n } from './i18n'

initFrontendI18n()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/ury">
      <App />
      <ToastProvider />
    </BrowserRouter>
  </StrictMode>,
)
