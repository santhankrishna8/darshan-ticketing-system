import { Component } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-admin',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent {
  constructor(private authService: AuthService) {}

  logout() {
    this.authService.logout();
  }
 username: string | null = '';

  ngOnInit(): void {
    this.username = localStorage.getItem('username'); // get username from storage
  }
  menuOpen = false;
toggleMenu() { this.menuOpen = !this.menuOpen; }

}
