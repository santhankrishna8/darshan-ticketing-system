import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'గోవిందమాల దర్శనం' },
  { path: 'register', loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent), title: 'Register | నమోదు' },
  { path: 'ticket', loadComponent: () => import('./pages/ticket/ticket.component').then(m => m.TicketComponent), title: 'My ticket | టికెట్' },
  { path: 'seva', loadChildren: () => import('./seva/seva.routes').then(m => m.SEVA_ROUTES), title: 'Seva desk' },
  // Links shared last year keep working.
  { path: 'form', redirectTo: 'register' },
  { path: 'search', redirectTo: 'ticket' },
  { path: 'home', redirectTo: '' },
  { path: 'login', redirectTo: 'seva' },
  { path: 'admin-dashboard', redirectTo: 'seva' },
  { path: 'reference-dashboard', redirectTo: 'seva' },
  { path: '**', redirectTo: '' },
];
