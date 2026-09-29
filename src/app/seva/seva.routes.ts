import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { SevaShellComponent } from './shell/shell.component';

const guard =
  (allowed: (auth: AuthService) => boolean): CanActivateFn =>
  async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.ready;
    return allowed(auth) || router.parseUrl('/seva/registrations');
  };
const ownerOnly = guard(a => a.isOwner());

export const SEVA_ROUTES: Routes = [
  {
    path: '',
    component: SevaShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', loadComponent: () => import('./overview/overview.component').then(m => m.OverviewComponent), title: 'Overview | Seva desk' },
      { path: 'register', loadComponent: () => import('../pages/register/register.component').then(m => m.RegisterComponent), data: { embedded: true }, title: 'New registration | Seva desk' },
      { path: 'registrations', loadComponent: () => import('./registrations/registrations.component').then(m => m.RegistrationsComponent), title: 'Registrations | Seva desk' },
      { path: 'people', canActivate: [ownerOnly], loadComponent: () => import('./people/people.component').then(m => m.PeopleComponent), title: 'People | Seva desk' },
      { path: 'settings', canActivate: [ownerOnly], loadComponent: () => import('./settings/settings.component').then(m => m.SettingsComponent), title: 'Settings | Seva desk' },
      { path: 'device', loadComponent: () => import('./device/device.component').then(m => m.DeviceComponent), title: 'This device | Seva desk' },
    ],
  },
];
