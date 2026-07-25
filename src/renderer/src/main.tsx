import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './components/App'
import './styles/variables.css'
import './styles/reset.css'
import './styles/antd-overrides.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
