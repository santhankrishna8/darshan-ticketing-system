import { Routes } from '@angular/router';
import { RegisterComponent } from './pages/register/register.component';

export const routes: Routes = [
  // The registration form is the first thing people see.
  { path: '', component: RegisterComponent, title: 'గోవిందమాల దర్శనం | Registration' },
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
