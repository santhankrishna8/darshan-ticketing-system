import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SeasonService } from '../core/season.service';
import { I18nService } from './i18n.service';
import { IconComponent } from './icon';
import { SettingsSheetComponent } from './settings-sheet';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive, IconComponent, SettingsSheetComponent],
  template: `
    <header>
      <div class="container bar">
        <a routerLink="/" class="brand">{{ i18n.t('Govindamala Darshan', 'గోవిందమాల దర్శనం') }} <span>{{ season.season }}</span></a>
        <nav aria-label="Main">
          <a routerLink="/ticket" routerLinkActive="active" class="link" data-tour="nav-ticket"><app-icon name="ticket" />{{ i18n.t('Ticket', 'టికెట్') }}</a>
          <app-settings-sheet />
        </nav>
      </div>
    </header>
  `,
  styles: `
    header { border-bottom: 1px solid var(--border); background: hsl(0 0% 100% / 0.9); backdrop-filter: saturate(1.2) blur(8px); position: sticky; top: 0; z-index: 20; }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; }
    .brand { text-decoration: none; font-weight: 500; font-size: 0.95rem; white-space: nowrap; }
    .brand span { color: var(--muted-foreground); font-weight: 400; }
    nav { display: flex; align-items: center; gap: 2px; }
    .link { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 10px; border-radius: var(--radius); text-decoration: none; font-size: 0.9rem; color: var(--muted-foreground); }
    .link:hover, .link.active { background: var(--accent); color: var(--foreground); }
    @media (max-width: 360px) { .bar { gap: 4px; } .brand { font-size: 0.875rem; } .brand span { display: none; } .link { padding: 0 8px; } }
  `,
})
export class SiteHeaderComponent {
  protected readonly season = inject(SeasonService);
  protected readonly i18n = inject(I18nService);
}
