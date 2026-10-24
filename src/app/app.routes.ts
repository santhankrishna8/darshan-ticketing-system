import { Routes } from '@angular/router';

export const routes: Routes = [
  // The entry page is the organizer sign-in (the seva desk shows it until someone signs in).
  // The registration form is only reachable inside the desk, at /seva/register.
  { path: '', pathMatch: 'full', redirectTo: 'seva' },
  { path: 'ticket', loadComponent: () => import('./pages/ticket/ticket.component').then(m => m.TicketComponent), title: 'My ticket | టికెట్' },
  { path: 'seva', loadChildren: () => import('./seva/seva.routes').then(m => m.SEVA_ROUTES), title: 'Seva desk' },
  // Links shared earlier keep working.
  { path: 'register', redirectTo: '' },
  { path: 'form', redirectTo: '' },
  { path: 'search', redirectTo: 'ticket' },
  { path: 'home', redirectTo: '' },
  { path: 'login', redirectTo: 'seva' },
  { path: 'admin-dashboard', redirectTo: 'seva' },
  { path: 'reference-dashboard', redirectTo: 'seva' },
  { path: '**', redirectTo: '' },
];
