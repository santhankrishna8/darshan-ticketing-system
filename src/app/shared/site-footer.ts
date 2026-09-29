import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeasonService } from '../core/season.service';
import { formatPhone } from '../core/ticket-pdf';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  template: `
    <footer>
      <div class="container inner">
        @if (season.settings(); as s) {
          <div>
            <p class="title">{{ s.eventTitleTe }}</p>
            <p class="muted">{{ s.placeTe }}</p>
          </div>
          <div class="contact">
            <p class="muted">వివరాలకు · For details</p>
            <a class="phone" [href]="'tel:+91' + s.contactPhone"><i class="ph ph-phone" aria-hidden="true"></i>{{ s.contactName }}, {{ fmt(s.contactPhone) }}</a>
          </div>
        }
        <a routerLink="/seva" class="staff">Seva desk sign in</a>
      </div>
      <div class="temple-band" aria-hidden="true"></div>
    </footer>
  `,
  styles: `
    footer { margin-top: 64px; border-top: 1px solid var(--line); background: var(--surface-sunk); }
    .inner { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 20px; padding-block: 28px; }
    .title { font-family: var(--font-display); font-size: 1.15rem; }
    .phone { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: 1.05rem; min-height: 44px; }
    .staff { font-size: 0.9rem; color: var(--ink-soft); }
  `,
})
export class SiteFooterComponent {
  protected readonly season = inject(SeasonService);
  protected readonly fmt = formatPhone;
}
