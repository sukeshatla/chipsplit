import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './app/auth';
import { ToastProvider } from './app/toast';
import { applyTheme } from './lib/theme';
import './index.css';

applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

const queryClient = new QueryClient({
  // Five minutes fresh keeps phone app-switching from re-downloading everything (SPEC PLAT-6);
  // every write still reloads at once (useAction).
  defaultOptions: { queries: { staleTime: 5 * 60_000, refetchOnWindowFocus: true, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
