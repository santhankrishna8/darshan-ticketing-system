import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const mockUsers = [
  { email: 'admin@gmail.com', password: 'admin123', role: 'admin' },
  { email: 'ref@example.com', password: 'ref123', role: 'reference' },
  { email: 'user@example.com', password: 'user123', role: 'user' }
];
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  email = '';
  password = '';
  errorMessage = '';

  constructor(private router: Router, private authService: AuthService) {}

  login() {
    const user = mockUsers.find(
      (u) => u.email === this.email && u.password === this.password
    );

    if (!user) {
      this.errorMessage = 'Invalid email or password';
      return;
    }

    this.authService.login(user.role); // ✅ track login in AuthService
    localStorage.setItem('username', user.email); 
    if (user.role === 'admin') {
      this.router.navigate(['/admin-dashboard']);
    } else if (user.role === 'reference') {
      this.router.navigate(['/reference-dashboard']);
    } else {
      this.errorMessage = 'Role not assigned!';
    }
  }
}
