import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BiometricService } from '../../core/biometric.service';
import { SeasonService } from '../../core/season.service';
import { TourButtonComponent, TourService } from '../../shared/tour';
import { StaffDataService } from '../staff-data.service';
import { IconComponent } from '../../shared/icon';

@Component({
  selector: 'app-seva-shell',
  imports: [IconComponent, RouterOutlet, RouterLink, RouterLinkActive, TourButtonComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class SevaShellComponent implements OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly biometric = inject(BiometricService);
  protected readonly season = inject(SeasonService);
  private readonly data = inject(StaffDataService);
  private readonly tour = inject(TourService);

  protected readonly busy = signal(false);
  private creatingSeason = false;
  private readonly fingerprintDismissed = signal(readFlag('seva.fingerprint.dismissed'));
  /** Organizers are allowed fingerprint unlock by default; offer to set it up once per phone. */
  protected readonly offerFingerprint = computed(
    () =>
      this.auth.access() === 'approved' &&
      this.auth.biometricAllowed() &&
      this.biometric.supported() &&
      !this.biometric.isEnrolled(this.auth.user()?.uid) &&
      !this.fingerprintDismissed(),
  );
  protected readonly enrolling = signal(false);
  protected readonly unlockError = signal<string | null>(null);
  protected readonly firstName = computed(() => (this.auth.user()?.displayName ?? '').split(' ')[0]);
  protected readonly roleLabel = computed(() => ({ owner: 'Main admin', admin: 'Admin', volunteer: 'Organizer' })[this.auth.role() ?? 'volunteer']);

  constructor() {
    // On phones the tabs scroll sideways: keep the current one in view.
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe(e => {
        if (e instanceof NavigationEnd)
          setTimeout(() => document.querySelector('nav[aria-label="Seva desk"] a.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      });
    // Only listen to registrations while an approved, unlocked person is here.
    effect(() => (this.auth.access() === 'approved' ? this.data.start() : this.data.stop()));
    effect(() => {
      if (this.auth.access() === 'approved') this.tour.offer(this.auth.isOwner() ? 'seva-owner' : 'seva', this.tourSteps());
      else this.tour.withdraw(this.auth.isOwner() ? 'seva-owner' : 'seva');
    });
    // First time the main admin opens the desk: create this season (open for registration).
    effect(() => {
      if (this.auth.access() === 'approved' && this.auth.isOwner() && this.season.settings() === null && !this.creatingSeason) {
        this.creatingSeason = true;
        this.season.createSeason().catch(e => {
          console.error(e);
          this.creatingSeason = false;
        });
      }
    });
    // If the main admin withdrew biometric permission, a locked device must sign in with Google again.
    effect(() => {
      const uid = this.auth.user()?.uid;
      if (uid && this.auth.access() === 'locked' && this.auth.staff() !== undefined && !this.auth.biometricAllowed()) {
        this.biometric.forget(uid);
        this.auth.signOut();
      }
    });
  }

  ngOnDestroy(): void {
    this.tour.withdraw('seva');
    this.data.stop();
  }

  private tourSteps() {
    return [
      {
        title: 'Welcome to the seva desk',
        titleTe: 'సేవా డెస్క్',
        body: 'Everything for running this year\'s registration is here. A quick look around.',
        bodyTe: 'ఈ సంవత్సరం నమోదు పనులన్నీ ఇక్కడే.',
      },
      { target: '[data-tour=nav-overview]', title: 'Overview', titleTe: 'సారాంశం', body: 'Totals at a glance: tickets registered, paid, pending, and per coordinator.', bodyTe: 'మొత్తం టికెట్లు, చెల్లింపులు, సమన్వయకర్తల వారీగా.' },
      { target: '[data-tour=nav-registrations]', title: 'Registrations', titleTe: 'నమోదులు', body: 'Search devotees, mark payments as Paid, reprint tickets and export Excel.', bodyTe: 'వెతకండి, చెల్లింపు గుర్తించండి, టికెట్ మళ్ళీ ఇవ్వండి.' },
      { target: '[data-tour=nav-new]', title: 'Register walk-ins', titleTe: 'నేరుగా నమోదు', body: 'Register a family yourself. Staff can do this even after public registration closes.', bodyTe: 'నమోదు మూసిన తర్వాత కూడా సిబ్బంది నమోదు చేయవచ్చు.' },
      { target: '[data-tour=nav-people]', title: 'People', titleTe: 'వ్యక్తులు', body: 'Approve or decline access requests and choose organizer or admin. Fingerprint unlock is on for everyone you approve.', bodyTe: 'అనుమతులు ఇవ్వండి, పాత్రలు ఎంచుకోండి.' },
      { target: '[data-tour=nav-settings]', title: 'Settings', titleTe: 'అమరికలు', body: 'Ticket count, fee, coordinators, and the switch that opens or closes registration.', bodyTe: 'టికెట్ల సంఖ్య, రుసుము, నమోదు తెరవడం/మూసివేయడం.' },
      { target: '[data-tour=nav-device]', title: 'This device', titleTe: 'ఈ ఫోన్', body: 'Turn on fingerprint unlock for this phone, or sign out.', bodyTe: 'వేలిముద్రతో తెరవడం ఆన్ చేయండి లేదా సైన్ అవుట్.' },
    ];
  }

  protected async enableFingerprint(): Promise<void> {
    const u = this.auth.user();
    if (!u) return;
    this.enrolling.set(true);
    try {
      await this.biometric.enroll({ uid: u.uid, email: u.email ?? '', name: u.displayName ?? '' });
    } catch (e) {
      console.error(e);
    } finally {
      this.enrolling.set(false);
    }
  }

  protected dismissFingerprint(): void {
    this.fingerprintDismissed.set(true);
    try {
      localStorage.setItem('seva.fingerprint.dismissed', '1');
    } catch {
      /* ignore */
    }
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

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
