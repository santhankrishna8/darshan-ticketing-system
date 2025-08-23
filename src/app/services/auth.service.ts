import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private isLoggedIn = false;
  private userRole: string | null = null;

  constructor(private router: Router) {}

  login(role: string) {
    this.isLoggedIn = true;
    this.userRole = role;
  }

  logout() {
    this.isLoggedIn = false;
    this.userRole = null;
    this.router.navigate(['/login']);  // 👈 redirect to login
  }

  getRole() {
    return this.userRole;
  }

  getLoggedIn() {
    return this.isLoggedIn;
  }
}
