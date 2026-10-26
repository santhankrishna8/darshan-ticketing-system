import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { IconComponent } from '../../shared/icon';

/** Backup sign-in for an organizer whose phone cannot finish Google sign-in. Not linked from anywhere; share the address. */
@Component({
  selector: 'app-staff-login',
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <main class="wrap">
      <form class="card box" (ngSubmit)="submit()" novalidate>
        <h1>Staff sign in</h1>
        <p class="muted">Use the email and password the main admin gave you. The main admin still has to approve you after you sign in.</p>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" class="input" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" [(ngModel)]="email" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" class="input" type="password" autocomplete="current-password" [(ngModel)]="password" />
        </div>
        @if (auth.error()) {
          <div class="notice notice-error" role="alert"><app-icon name="warning-circle" /><p>{{ auth.error() }}</p></div>
        }
        <button type="submit" class="btn btn-primary btn-lg" [disabled]="busy()">
          @if (busy()) { <app-icon name="spinner-gap" class="spin" />Signing in… } @else { Sign in }
        </button>
        <a routerLink="/seva" class="muted">Back to Google sign-in</a>
      </form>
    </main>
  `,
  styles: `
    .wrap { min-height: 100dvh; display: flex; justify-content: center; align-items: flex-start; padding: clamp(32px, 12vh, 120px) 16px 32px; }
    .box { width: min(100%, 440px); padding: 28px; display: flex; flex-direction: column; gap: 14px; }
    .box h1 { font-size: 1.4rem; }
    .box .btn-primary { width: 100%; }
  `,
})
export class StaffLoginComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);

  protected async submit(): Promise<void> {
    this.busy.set(true);
    try {
      if (await this.auth.signInWithPassword(this.email, this.password)) await this.router.navigateByUrl('/seva');
    } finally {
      this.busy.set(false);
    }
  }
}
