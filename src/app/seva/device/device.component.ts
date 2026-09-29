import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { BiometricService } from '../../core/biometric.service';
import { ToastService } from '../../shared/toast';

/** Per-device security: biometric unlock and sign out. */
@Component({
  selector: 'app-device',
  template: `
    <h1>This device</h1>
    <section class="panel box">
      <i class="ph ph-fingerprint big-icon" aria-hidden="true"></i>
      <div class="text">
        <h2>Fingerprint or face unlock</h2>
        @if (!auth.biometricAllowed()) {
          <p class="muted">The main admin has not allowed fingerprint unlock for your account.</p>
        } @else if (!biometric.supported()) {
          <p class="muted">This phone or browser does not offer fingerprint or face unlock for websites.</p>
        } @else if (enrolled()) {
          <p>On. When you come back to the seva desk on this phone, it asks for your fingerprint or face before opening.</p>
        } @else {
          <p class="muted">Keep the seva desk locked on this phone. Your fingerprint or face never leaves the device.</p>
        }
      </div>
      @if (auth.biometricAllowed() && biometric.supported()) {
        @if (enrolled()) {
          <button type="button" class="btn" (click)="turnOff()">Turn off</button>
        } @else {
          <button type="button" class="btn btn-primary" (click)="turnOn()" [disabled]="busy()">Turn on</button>
        }
      }
    </section>

    <section class="panel box">
      <i class="ph ph-sign-out big-icon" aria-hidden="true"></i>
      <div class="text">
        <h2>Sign out</h2>
        <p class="muted">Signed in as {{ auth.user()?.email }}. Signing out also removes fingerprint unlock from this phone.</p>
      </div>
      <button type="button" class="btn" (click)="auth.signOut()">Sign out</button>
    </section>
  `,
  styles: `
    h1 { font-size: 2rem; }
    h2 { font-family: var(--font-text); font-weight: 700; font-size: 1.15rem; }
    .box { padding: 20px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; box-shadow: none; max-width: 760px; }
    .text { flex: 1 1 280px; }
    .big-icon { font-size: 2rem; color: var(--kumkum); }
  `,
})
export class DeviceComponent {
  protected readonly auth = inject(AuthService);
  protected readonly biometric = inject(BiometricService);
  private readonly toast = inject(ToastService);
  protected readonly busy = signal(false);
  protected readonly enrolled = computed(() => this.biometric.isEnrolled(this.auth.user()?.uid));

  protected async turnOn(): Promise<void> {
    const u = this.auth.user();
    if (!u) return;
    this.busy.set(true);
    try {
      await this.biometric.enroll({ uid: u.uid, email: u.email ?? '', name: u.displayName ?? '' });
      this.toast.show('Fingerprint unlock is on for this phone', 'ok');
    } catch (e: any) {
      console.error(e);
      this.toast.show(e?.name === 'NotAllowedError' ? 'Setup was cancelled.' : 'Could not set up fingerprint unlock on this device.', 'error');
    } finally {
      this.busy.set(false);
    }
  }

  protected turnOff(): void {
    this.biometric.forget();
    this.biometric.markUnlocked(this.auth.user()?.uid ?? null);
    this.toast.show('Fingerprint unlock turned off', 'ok');
  }
}
