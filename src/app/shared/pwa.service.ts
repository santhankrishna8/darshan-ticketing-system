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
  /** iPhone and iPad have no install prompt: people add the site from the Share menu. */
  readonly ios = detectIos();
  readonly isIos = this.ios !== null;
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

export type IosBrowser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'in-app' | 'other';

export interface IosInfo {
  browser: IosBrowser;
  /** e.g. 16.4; 0 when unknown. */
  version: number;
  ipad: boolean;
}

/**
 * Safari can add any site to the Home Screen; Chrome, Edge and Firefox can too from iOS 16.4.
 * In-app browsers (WhatsApp, Instagram, Facebook, Gmail...) cannot, so the site must be opened in Safari.
 */
function detectIos(): IosInfo | null {
  const ua = navigator.userAgent;
  const ipad = /ipad/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  if (!/iphone|ipod/i.test(ua) && !ipad) return null;
  const v = ua.match(/OS (\d+)[_.](\d+)/) ?? ua.match(/Version\/(\d+)\.(\d+)/);
  const version = v ? Number(v[1]) + Number(v[2]) / 10 : 0;
  const browser: IosBrowser = /CriOS/.test(ua)
    ? 'chrome'
    : /EdgiOS/.test(ua)
      ? 'edge'
      : /FxiOS/.test(ua)
        ? 'firefox'
        : /FBAN|FBAV|Instagram|Line\/|WhatsApp|GSA\/|Snapchat|Twitter|LinkedInApp/.test(ua) || !/Safari\//.test(ua)
          ? 'in-app'
          : /Version\/.*Safari\//.test(ua)
            ? 'safari'
            : 'other';
  return { browser, version, ipad };
}
