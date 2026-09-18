import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('No se encontró el elemento #root');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
