import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@harness/widgets/skill-factory'
import App from './App'
import './styles/index.css'
import { initErrorReporting } from './monitoring/error-reporting'

initErrorReporting()

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
