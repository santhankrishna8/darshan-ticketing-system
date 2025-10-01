import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { AdminComponent } from './admin/admin.component';
import { RefMemberComponent } from './ref-member/ref-member.component';
import { DevoteeFormComponent } from './devotee-form/devotee-form.component';
import { SearchComponent } from './search/search.component';
import { HomeComponent } from './home/home.component';


export const routes: Routes = [
  // { path: '', redirectTo: 'form', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'admin-dashboard', component: AdminComponent },
  { path: 'reference-dashboard', component: RefMemberComponent },
  {path:'form',component:DevoteeFormComponent},
  {path:'search',component:SearchComponent},
  {path:'home',component:HomeComponent},
  { path: '**', redirectTo: 'home' }
];
