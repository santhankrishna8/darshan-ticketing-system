import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BiometricService } from '../../core/biometric.service';
import { SeasonService } from '../../core/season.service';
import { StaffDataService } from '../staff-data.service';

@Component({
  selector: 'app-seva-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class SevaShellComponent implements OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly biometric = inject(BiometricService);
  protected readonly season = inject(SeasonService);
  private readonly data = inject(StaffDataService);

  protected readonly busy = signal(false);
  protected readonly unlockError = signal<string | null>(null);
  protected readonly firstName = computed(() => (this.auth.user()?.displayName ?? '').split(' ')[0]);
  protected readonly roleLabel = computed(() => ({ owner: 'Main admin', admin: 'Admin', volunteer: 'Volunteer' })[this.auth.role() ?? 'volunteer']);

  constructor() {
    // Only listen to registrations while an approved, unlocked person is here.
    effect(() => (this.auth.access() === 'approved' ? this.data.start() : this.data.stop()));
    // If the main admin withdrew biometric permission, a locked device must sign in with Google again.
    effect(() => {
      if (this.auth.access() === 'locked' && this.auth.staff() !== undefined && !this.auth.biometricAllowed()) this.auth.signOut();
    });
  }

  ngOnDestroy(): void {
    this.data.stop();
  }

  protected async signIn(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.signInWithGoogle();
    } finally {
      this.busy.set(false);
    }
  }

  protected async unlock(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) return;
    this.unlockError.set(null);
    try {
      if (!(await this.biometric.unlock(uid))) this.unlockError.set('The device could not confirm it is you. Try again or use Google.');
    } catch (e: any) {
      this.unlockError.set(e?.name === 'NotAllowedError' ? 'Unlock was cancelled.' : 'This device could not unlock. Use Google sign-in instead.');
    }
  }

  protected async useGoogleInstead(): Promise<void> {
    await this.auth.signOut();
    await this.signIn();
  }
}
