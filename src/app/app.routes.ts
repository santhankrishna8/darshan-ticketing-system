import { Routes } from '@angular/router';

export const routes: Routes = [
  // The entry page is the public registration form. Organizers sign in at /seva (also linked from the settings panel).
  { path: '', pathMatch: 'full', loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent), title: 'గోవిందమాల దర్శనం | Registration' },
  { path: 'register', redirectTo: '' },
  { path: 'ticket', loadComponent: () => import('./pages/ticket/ticket.component').then(m => m.TicketComponent), title: 'My ticket | టికెట్' },
  { path: 'seva', loadChildren: () => import('./seva/seva.routes').then(m => m.SEVA_ROUTES), title: 'Seva desk' },
  { path: 'staff-login', loadComponent: () => import('./seva/staff-login/staff-login.component').then(m => m.StaffLoginComponent), title: 'Staff sign in' },
  // Links shared earlier keep working.
  { path: 'form', redirectTo: '' },
  { path: 'search', redirectTo: 'ticket' },
  { path: 'home', redirectTo: '' },
  { path: 'login', redirectTo: 'seva' },
  { path: 'admin-dashboard', redirectTo: 'seva' },
  { path: 'reference-dashboard', redirectTo: 'seva' },
  { path: '**', redirectTo: '' },
];
