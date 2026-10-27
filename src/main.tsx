import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { db } from './db';
import { ErrorBoundary, StorageBlocked } from './Fatal';
import './styles.css';

registerSW({ immediate: true });
navigator.storage?.persist?.();

const root = createRoot(document.getElementById('root')!);

// Open the on-device database first so a browser that blocks storage gets an explanation, not a blank page.
db.open()
  .then(() =>
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    ),
  )
  .catch((error) => root.render(<StorageBlocked error={error} />));
