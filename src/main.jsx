import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import { RouterProvider } from './lib/router.jsx'
import { StoreProvider } from './lib/store.jsx'
import './styles.css'

// Offline-first: take the new build silently on the next launch. There is no
// "an update is available" prompt — that is a decision nobody asked for.
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </RouterProvider>
  </StrictMode>
)
