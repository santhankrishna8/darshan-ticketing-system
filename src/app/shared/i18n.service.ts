import { Injectable, signal } from '@angular/core';

export type Lang = 'en' | 'te';
const KEY = 'app.lang';

/** One language at a time; switched from Settings and remembered on this device. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(I18nService.stored());

  set(lang: Lang): void {
    this.lang.set(lang);
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* private mode: choice lasts for this visit */
    }
  }

  /** Picks the text for the current language. */
  t(en: string, te: string): string {
    return this.lang() === 'te' ? te : en;
  }

  private static stored(): Lang {
    try {
      return localStorage.getItem(KEY) === 'te' ? 'te' : 'en';
    } catch {
      return 'en';
    }
  }
}
