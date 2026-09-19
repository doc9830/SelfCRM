import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { DataProvider } from './state/DataContext'
import { SortProvider } from './state/SortContext'
import { ThemeProvider } from './state/ThemeContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <DataProvider>
        <SortProvider>
          <App />
        </SortProvider>
      </DataProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
