import { Injectable, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Install-to-home-screen and "new version ready" handling. */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly sw = inject(SwUpdate);
  private deferred: InstallPromptEvent | null = null;

  readonly standalone = signal(
    matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true,
  );
  /** Android/desktop Chrome offered an install prompt. */
  readonly canPrompt = signal(false);
  /** iPhone Safari has no prompt; people add it from the Share menu. */
  readonly isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  readonly canInstall = computed(() => !this.standalone() && (this.canPrompt() || this.isIos));
  readonly updateReady = signal(false);

  constructor() {
    addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferred = e as InstallPromptEvent;
      this.canPrompt.set(true);
    });
    addEventListener('appinstalled', () => {
      this.deferred = null;
      this.canPrompt.set(false);
      this.standalone.set(true);
    });

    if (this.sw.isEnabled) {
      this.sw.versionUpdates.subscribe(e => {
        if (e.type === 'VERSION_READY') this.updateReady.set(true);
      });
      this.sw.unrecoverable.subscribe(() => location.reload());
      // Long-open organizer phones should still pick up fixes.
      setInterval(() => this.sw.checkForUpdate().catch(() => undefined), 30 * 60_000);
    }
  }

  /** Returns false when the browser has no prompt (iPhone): show the Share-menu hint instead. */
  async install(): Promise<boolean> {
    if (!this.deferred) return false;
    await this.deferred.prompt();
    await this.deferred.userChoice;
    this.deferred = null;
    this.canPrompt.set(false);
    return true;
  }

  async reload(): Promise<void> {
    await this.sw.activateUpdate().catch(() => undefined);
    location.reload();
  }
}
