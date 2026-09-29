import { Injectable, computed, signal } from '@angular/core';
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { SEASON, db } from './firebase';
import { Counter, DEFAULT_SETTINGS, SeasonSettings } from './models';

export const seasonRef = () => doc(db, 'seasons', SEASON);
export const counterRef = () => doc(db, 'seasons', SEASON, 'meta', 'counter');

/** Live view of this season's settings and ticket counter. Both are publicly readable. */
@Injectable({ providedIn: 'root' })
export class SeasonService {
  readonly season = SEASON;
  /** undefined while loading, null when the season document has not been created yet. */
  readonly settings = signal<SeasonSettings | null | undefined>(undefined);
  readonly counter = signal<Counter | null>(null);
  readonly error = signal<string | null>(null);

  readonly ticketsLeft = computed(() => {
    const s = this.settings();
    return s ? Math.max(0, s.totalTickets - (this.counter()?.lastTicket ?? 0)) : 0;
  });
  readonly registered = computed(() => this.counter()?.lastTicket ?? 0);

  constructor() {
    onSnapshot(
      seasonRef(),
      snap => this.settings.set(snap.exists() ? { ...DEFAULT_SETTINGS(SEASON), ...(snap.data() as SeasonSettings) } : null),
      err => {
        this.error.set(err.message);
        this.settings.set(null);
      },
    );
    onSnapshot(
      counterRef(),
      snap => this.counter.set(snap.exists() ? (snap.data() as Counter) : null),
      () => this.counter.set(null),
    );
  }

  /** Main admin only: creates seasons/{season} and its ticket counter. Earlier data is not touched. */
  async createSeason(): Promise<void> {
    const batch = writeBatch(db);
    batch.set(seasonRef(), { ...DEFAULT_SETTINGS(SEASON), createdAt: serverTimestamp() });
    batch.set(counterRef(), { lastTicket: 0, lastSubmission: 0, lastRegistrationId: '' });
    await batch.commit();
  }

  async saveSettings(changes: Partial<SeasonSettings>): Promise<void> {
    await updateDoc(seasonRef(), { ...changes, updatedAt: serverTimestamp() });
  }

  /** Repairs a missing counter document (main admin only). */
  async ensureCounter(): Promise<void> {
    if (!this.counter()) await setDoc(counterRef(), { lastTicket: 0, lastSubmission: 0, lastRegistrationId: '' });
  }
}
