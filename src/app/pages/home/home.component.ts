import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeasonService } from '../../core/season.service';
import { SiteFooterComponent } from '../../shared/site-footer';
import { SiteHeaderComponent } from '../../shared/site-header';

@Component({
  selector: 'app-home',
  imports: [RouterLink, SiteHeaderComponent, SiteFooterComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  protected readonly season = inject(SeasonService);

  protected readonly status = computed<'loading' | 'soon' | 'open' | 'full' | 'closed'>(() => {
    const s = this.season.settings();
    if (s === undefined) return 'loading';
    if (!s || !this.season.counter()) return 'soon';
    if (this.season.ticketsLeft() <= 0) return 'full';
    return s.registrationOpen ? 'open' : this.season.registered() > 0 ? 'closed' : 'soon';
  });

  protected readonly gallery = ['p9', 'p1', 'p10', 'p2', 'p7', 'p3', 'p5', 'p4', 'p8'].map(p => `assets/${p}.jpg`);
}
