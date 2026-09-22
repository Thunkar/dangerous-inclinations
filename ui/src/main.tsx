import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The poster face for everything printed (design/press.ts). Registering the
// face costs nothing: the file is fetched only where something is set in it.
import '@fontsource-variable/oswald'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
