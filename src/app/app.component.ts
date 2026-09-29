import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaService } from './shared/pwa.service';
import { ToastHostComponent } from './shared/toast';
import { TourComponent } from './shared/tour';
import { IconComponent } from './shared/icon';
import { I18nService } from './shared/i18n.service';

@Component({
  selector: 'app-root',
  imports: [IconComponent, RouterOutlet, ToastHostComponent, TourComponent],
  template: `
    @if (pwa.updateReady()) {
      <div class="update" role="status">
        <app-icon name="arrows-clockwise" />
        <span>{{ i18n.t('A new version is ready', 'కొత్త వెర్షన్ సిద్ధంగా ఉంది') }}</span>
        <button type="button" class="btn btn-sm" (click)="pwa.reload()">{{ i18n.t('Reload', 'రీలోడ్') }}</button>
      </div>
    }
    <router-outlet />
    <app-toast-host />
    <app-tour />
  `,
  styles: `
    .update { position: sticky; top: 0; z-index: 40; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px;
      padding: 8px 16px; background: var(--foreground); color: var(--background); font-weight: 400; }
    .update .btn { min-height: 36px; }
  `,
})
export class AppComponent {
  protected readonly pwa = inject(PwaService);
  protected readonly i18n = inject(I18nService);
}
