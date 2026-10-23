import { ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })),
    // A worker keeps the security policy it was installed under, and the file itself never changes between deploys.
    // Change the number after "?v=" whenever the headers in vercel.json change in a way the worker depends on
    // (hosts in connect-src), so every returning browser installs a fresh worker.
    provideServiceWorker('ngsw-worker.js?v=2', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
  ],
};
