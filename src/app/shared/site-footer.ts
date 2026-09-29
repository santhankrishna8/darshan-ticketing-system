import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeasonService } from '../core/season.service';
import { formatPhone } from '../core/ticket-pdf';
import { IconComponent } from './icon';
import { InstallButtonComponent } from './install-button';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, IconComponent, InstallButtonComponent],
  template: `
    <footer>
      <div class="container inner">
        @if (season.settings(); as s) {
          <p class="muted">{{ s.eventTitleTe }}, {{ s.placeTe }}</p>
          <a class="phone" [href]="'tel:+91' + s.contactPhone"><app-icon name="phone" />వివరాలకు {{ s.contactName }}, {{ fmt(s.contactPhone) }}</a>
        }
        <div class="row">
          <app-install-button variant="btn-sm" label="Install app" />
          <a routerLink="/seva" class="staff">Admin sign in</a>
        </div>
      </div>
    </footer>
  `,
  styles: `
    footer { margin-top: 48px; border-top: 1px solid var(--border); }
    .inner { display: flex; flex-direction: column; gap: 10px; padding-block: 24px 32px; font-size: 0.9rem; }
    .phone { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; min-height: 40px; }
    .row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
    .staff { color: var(--muted-foreground); }
  `,
})
export class SiteFooterComponent {
  protected readonly season = inject(SeasonService);
  protected readonly fmt = formatPhone;
}
