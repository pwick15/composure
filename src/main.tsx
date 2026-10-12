import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/chrome.css'
import './styles/dump.css'
import './styles/board.css'
import './styles/overlays.css'

// No <StrictMode>: its dev-only double effects leave motion's exit animations stuck,
// so removed rows linger on screen in `pnpm dev` (production is unaffected).
createRoot(document.getElementById('root')!).render(<App />)
