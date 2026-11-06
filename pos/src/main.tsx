import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initI18n, t } from './i18n'
import { initPrinting, setErrorMessages } from '@ury/core'

initPrinting({ signKey: '' })

initI18n().then(() => {
  // Patch 46: technical errors (network, deadlock, expired session...) in the till's language.
  setErrorMessages({
    network: t('errors.network'),
    busy: t('errors.busy'),
    session: t('errors.session_expired'),
    unavailable: t('errors.server_unavailable'),
    unexpected: t('errors.unexpected'),
    printDraw: t('errors.print_draw'), // Patch 50
    printerUnreachable: t('errors.printer_unreachable'), // Patch 51
    qzNotRunning: t('errors.qz_not_running'), // Patch 55
  })
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

  