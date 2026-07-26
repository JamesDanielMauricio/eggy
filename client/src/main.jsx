import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import EggFarmDashboard from './EggFarmDashboard.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <EggFarmDashboard />
  </StrictMode>,
)
