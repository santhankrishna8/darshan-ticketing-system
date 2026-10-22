import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAX_PER_REGISTRATION, SeasonSettings } from '../../core/models';
import { SeasonService } from '../../core/season.service';
import { ToastService } from '../../shared/toast';
import { IconComponent } from '../../shared/icon';
import { CoordinatorsComponent } from './coordinators';

/** Main admin: the season's ticket limits, fee, instructions and coordinators. */
@Component({
  selector: 'app-settings',
  imports: [IconComponent, FormsModule, CoordinatorsComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  protected readonly season = inject(SeasonService);
  private readonly toast = inject(ToastService);

  protected draft: SeasonSettings | null = null;
  protected readonly saving = signal(false);
  protected readonly creating = signal(false);
  protected dirty = false;

  constructor() {
    // Load the saved settings into the form, unless there are unsaved edits.
    effect(() => {
      const s = this.season.settings();
      if (s && !this.dirty) {
        this.draft = structuredClone(s);
      }
    });
  }

  protected async create(): Promise<void> {
    this.creating.set(true);
    try {
      await this.season.createSeason();
      this.toast.show(`Season ${this.season.season} created. Review the settings, then open registration.`, 'ok', 6000);
    } catch (e: any) {
      console.error(e);
      this.toast.show(e?.code === 'permission-denied' ? 'Permission denied: deploy the Firestore rules (see README).' : 'Could not create the season.', 'error', 6000);
    } finally {
      this.creating.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (!this.draft) return;
    const d = this.draft;
    const problem = this.check(d);
    if (problem) {
      this.toast.show(problem, 'error', 6000);
      return;
    }
    this.saving.set(true);
    try {
      // Coordinators save on their own, straight away; never overwrite them from this form.
      const { season: _season, coordinators: _c, ticketsPerCoordinator: _t, ...changes } = d;
      await this.season.saveSettings({
        ...changes,
        totalTickets: Number(d.totalTickets),
        maxPerGroup: Number(d.maxPerGroup),
        minAge: Number(d.minAge),
        maxAge: Number(d.maxAge),
        fee: Number(d.fee),
        contactPhone: String(d.contactPhone).replace(/\D/g, ''),
      });
      this.dirty = false;
      this.toast.show('Settings saved', 'ok');
    } catch (e) {
      console.error(e);
      this.toast.show('Could not save settings.', 'error');
    } finally {
      this.saving.set(false);
    }
  }

  /** The first thing wrong with the form, or null. Empty or fractional numbers would otherwise be saved as 0 or break registration. */
  private check(d: SeasonSettings): string | null {
    const whole = (v: unknown, min: number, max: number) => v !== null && v !== '' && Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;
    if (!whole(d.totalTickets, 1, 100_000)) return 'Total tickets must be a whole number, at least 1.';
    if (Number(d.totalTickets) < this.season.registered()) return `Total tickets cannot be less than the ${this.season.registered()} already registered.`;
    if (!whole(d.maxPerGroup, 1, MAX_PER_REGISTRATION)) return `Max devotees per registration must be a whole number from 1 to ${MAX_PER_REGISTRATION}.`;
    if (!whole(d.minAge, 0, 130) || !whole(d.maxAge, 0, 130)) return 'Ages must be whole numbers from 0 to 130.';
    if (Number(d.minAge) > Number(d.maxAge)) return 'Minimum age cannot be more than the maximum age.';
    if (!whole(d.fee, 0, 1_000_000)) return 'The fee must be a whole number of rupees, 0 or more.';
    return null;
  }

  protected async toggleOpen(): Promise<void> {
    const s = this.season.settings();
    if (!s) return;
    try {
      await this.season.saveSettings({ registrationOpen: !s.registrationOpen });
      this.toast.show(s.registrationOpen ? 'Registration closed' : 'Registration is now open', 'ok');
    } catch {
      this.toast.show('Could not change registration status.', 'error');
    }
  }
}
