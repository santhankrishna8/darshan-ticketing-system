import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SeasonSettings } from '../../core/models';
import { SeasonService } from '../../core/season.service';
import { ToastService } from '../../shared/toast';

/** Main admin: the season's ticket limits, fee, instructions and coordinators. */
@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  protected readonly season = inject(SeasonService);
  private readonly toast = inject(ToastService);

  protected draft: SeasonSettings | null = null;
  protected coordinatorsText = '';
  protected readonly saving = signal(false);
  protected readonly creating = signal(false);
  protected dirty = false;

  constructor() {
    // Load the saved settings into the form, unless there are unsaved edits.
    effect(() => {
      const s = this.season.settings();
      if (s && !this.dirty) {
        this.draft = structuredClone(s);
        this.coordinatorsText = s.coordinators.join('\n');
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
    const coordinators = this.coordinatorsText.split('\n').map(s => s.trim()).filter(Boolean);
    if (d.totalTickets < this.season.registered()) {
      this.toast.show(`Total tickets cannot be less than the ${this.season.registered()} already registered.`, 'error');
      return;
    }
    this.saving.set(true);
    try {
      const { season: _season, ...changes } = { ...d, coordinators };
      await this.season.saveSettings({
        ...changes,
        totalTickets: Number(d.totalTickets),
        maxPerGroup: Number(d.maxPerGroup),
        minAge: Number(d.minAge),
        maxAge: Number(d.maxAge),
        fee: Number(d.fee),
        ticketsPerCoordinator: Number(d.ticketsPerCoordinator),
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
