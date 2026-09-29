import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SeasonService } from '../core/season.service';
import { IconComponent } from './icon';
import { TourButtonComponent } from './tour';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive, TourButtonComponent, IconComponent],
  template: `
    <header>
      <div class="container bar">
        <a routerLink="/" class="brand">
          <span class="title">గోవిందమాల దర్శనం {{ season.season }}</span>
          <span class="sub">Govindamala Darshan</span>
        </a>
        <nav aria-label="Main">
          <a routerLink="/ticket" routerLinkActive="active" class="link" data-tour="nav-ticket"><app-icon name="ticket" />Ticket</a>
          <app-tour-button />
        </nav>
      </div>
    </header>
  `,
  styles: `
    header { border-bottom: 1px solid var(--border); background: var(--card); position: sticky; top: 0; z-index: 20; }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 60px; }
    .brand { display: flex; flex-direction: column; text-decoration: none; line-height: 1.2; min-width: 0; }
    .title { font-weight: 600; font-size: 1rem; }
    .sub { font-size: 0.8rem; color: var(--muted-foreground); }
    nav { display: flex; align-items: center; gap: 2px; }
    .link { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 10px; border-radius: var(--radius); text-decoration: none; font-weight: 500; font-size: 0.9rem; }
    .link:hover, .link.active { background: var(--accent); }
  `,
})
export class SiteHeaderComponent {
  protected readonly season = inject(SeasonService);
}
