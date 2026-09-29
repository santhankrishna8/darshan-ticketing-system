import { Component, inject, signal } from '@angular/core';
import { RegistrationService } from '../../core/registration.service';
import { ToastService } from '../../shared/toast';
import { downloadExcel, stamp } from '../excel';

/** Read-only access to last year's registrations, which stay in their original collections. */
@Component({
  selector: 'app-archive',
  template: `
    <h1>2025 archive</h1>
    <p class="muted intro">Last year's registrations are kept exactly as they were, in the original <code>devotees</code> collection. Nothing here can change them.</p>
    <div class="panel box">
      @if (count() !== null) {
        <p><strong class="big">{{ count() }}</strong> devotees registered in 2025.</p>
      }
      <button type="button" class="btn btn-primary" (click)="download()" [disabled]="loading()">
        @if (loading()) { <i class="ph ph-spinner-gap spin" aria-hidden="true"></i>Loading… }
        @else { <i class="ph ph-download-simple" aria-hidden="true"></i>Download 2025 Excel }
      </button>
    </div>
  `,
  styles: `
    h1 { font-size: 2rem; }
    .intro { max-width: 62ch; }
    .box { padding: 22px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; box-shadow: none; }
    .big { font-size: 1.8rem; color: var(--kumkum); }
  `,
})
export class ArchiveComponent {
  private readonly service = inject(RegistrationService);
  private readonly toast = inject(ToastService);
  protected readonly loading = signal(false);
  protected readonly count = signal<number | null>(null);

  protected async download(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await this.service.legacy2025();
      this.count.set(rows.length);
      if (rows.length) await downloadExcel(rows, 'Devotees 2025', `Darshan 2025 archive ${stamp()}.xlsx`);
      else this.toast.show('No 2025 data found.', 'info');
    } catch (e) {
      console.error(e);
      this.toast.show('Could not read the 2025 data. Check the deployed rules.', 'error');
    } finally {
      this.loading.set(false);
    }
  }
}
