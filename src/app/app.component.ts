import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaService } from './shared/pwa.service';
import { ToastHostComponent } from './shared/toast';
import { TourComponent } from './shared/tour';
import { IconComponent } from './shared/icon';

@Component({
  selector: 'app-root',
  imports: [IconComponent, RouterOutlet, ToastHostComponent, TourComponent],
  template: `
    @if (pwa.updateReady()) {
      <div class="update" role="status">
        <app-icon name="arrows-clockwise" />
        <span>A new version is ready · కొత్త వెర్షన్ సిద్ధం</span>
        <button type="button" class="btn btn-sm" (click)="pwa.reload()">Reload</button>
      </div>
    }
    <router-outlet />
    <app-toast-host />
    <app-tour />
  `,
  styles: `
    .update { position: sticky; top: 0; z-index: 40; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px;
      padding: 8px 16px; background: var(--foreground); color: var(--background); font-weight: 600; }
    .update .btn { min-height: 36px; }
  `,
})
export class AppComponent {
  protected readonly pwa = inject(PwaService);
}
