import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeasonService } from '../../core/season.service';
import { StaffDataService } from '../staff-data.service';

@Component({
  selector: 'app-overview',
  imports: [RouterLink],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css',
})
export class OverviewComponent {
  protected readonly season = inject(SeasonService);
  protected readonly data = inject(StaffDataService);

  protected readonly stats = computed(() => {
    const rows = this.data.rows();
    const fee = this.season.settings()?.fee ?? 0;
    const paid = rows.filter(r => r.paid).length;
    return {
      devotees: rows.length,
      groups: this.data.registrations()?.length ?? 0,
      paid,
      unpaid: rows.length - paid,
      collected: paid * fee,
      due: (rows.length - paid) * fee,
      scanned: rows.filter(r => r.scanned).length,
    };
  });

  protected readonly byCoordinator = computed(() => {
    const map = new Map<string, { name: string; total: number; paid: number }>();
    for (const r of this.data.rows()) {
      const key = r.coordinator || 'Not assigned';
      const e = map.get(key) ?? { name: key, total: 0, paid: 0 };
      e.total++;
      if (r.paid) e.paid++;
      map.set(key, e);
    }
    return [...map.values()];
  });
}
