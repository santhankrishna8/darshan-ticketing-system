import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { AdminComponent } from './admin/admin.component';
import { RefMemberComponent } from './ref-member/ref-member.component';
import { DevoteeFormComponent } from './devotee-form/devotee-form.component';


export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'admin-dashboard', component: AdminComponent },
  { path: 'reference-dashboard', component: RefMemberComponent },
  {path:'form',component:DevoteeFormComponent},
  { path: '**', redirectTo: 'login' }
];
