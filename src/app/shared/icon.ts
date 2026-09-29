import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import arrowLeftSvg from '@phosphor-icons/core/assets/regular/arrow-left.svg';
import arrowsClockwiseSvg from '@phosphor-icons/core/assets/regular/arrows-clockwise.svg';
import cameraSvg from '@phosphor-icons/core/assets/regular/camera.svg';
import chartBarSvg from '@phosphor-icons/core/assets/regular/chart-bar.svg';
import checkCircleSvg from '@phosphor-icons/core/assets/regular/check-circle.svg';
import currencyInrSvg from '@phosphor-icons/core/assets/regular/currency-inr.svg';
import deviceMobileSvg from '@phosphor-icons/core/assets/regular/device-mobile.svg';
import downloadSimpleSvg from '@phosphor-icons/core/assets/regular/download-simple.svg';
import exportSvg from '@phosphor-icons/core/assets/regular/export.svg';
import fingerprintSvg from '@phosphor-icons/core/assets/regular/fingerprint.svg';
import gearSvg from '@phosphor-icons/core/assets/regular/gear.svg';
import googleLogoSvg from '@phosphor-icons/core/assets/regular/google-logo.svg';
import hourglassMediumSvg from '@phosphor-icons/core/assets/regular/hourglass-medium.svg';
import identificationCardSvg from '@phosphor-icons/core/assets/regular/identification-card.svg';
import imageSvg from '@phosphor-icons/core/assets/regular/image.svg';
import listSvg from '@phosphor-icons/core/assets/regular/list.svg';
import lockSimpleSvg from '@phosphor-icons/core/assets/regular/lock-simple.svg';
import magnifyingGlassSvg from '@phosphor-icons/core/assets/regular/magnifying-glass.svg';
import phoneSvg from '@phosphor-icons/core/assets/regular/phone.svg';
import plusSvg from '@phosphor-icons/core/assets/regular/plus.svg';
import questionSvg from '@phosphor-icons/core/assets/regular/question.svg';
import shieldCheckSvg from '@phosphor-icons/core/assets/regular/shield-check.svg';
import signOutSvg from '@phosphor-icons/core/assets/regular/sign-out.svg';
import spinnerGapSvg from '@phosphor-icons/core/assets/regular/spinner-gap.svg';
import tShirtSvg from '@phosphor-icons/core/assets/regular/t-shirt.svg';
import ticketSvg from '@phosphor-icons/core/assets/regular/ticket.svg';
import trashSvg from '@phosphor-icons/core/assets/regular/trash.svg';
import userPlusSvg from '@phosphor-icons/core/assets/regular/user-plus.svg';
import usersSvg from '@phosphor-icons/core/assets/regular/users.svg';
import warningCircleSvg from '@phosphor-icons/core/assets/regular/warning-circle.svg';
import xSvg from '@phosphor-icons/core/assets/regular/x.svg';
import translateSvg from '@phosphor-icons/core/assets/regular/translate.svg';
import signInSvg from '@phosphor-icons/core/assets/regular/sign-in.svg';
import caretRightSvg from '@phosphor-icons/core/assets/regular/caret-right.svg';
import pencilSimpleSvg from '@phosphor-icons/core/assets/regular/pencil-simple.svg';
import caretUpSvg from '@phosphor-icons/core/assets/regular/caret-up.svg';
import caretDownSvg from '@phosphor-icons/core/assets/regular/caret-down.svg';

// Phosphor icons (regular), bundled as SVG text at build time so they always render,
// even offline or when a web font would be blocked.
const ICONS = {
  'caret-down': caretDownSvg,
  'caret-up': caretUpSvg,
  'pencil-simple': pencilSimpleSvg,
  'caret-right': caretRightSvg,
  'sign-in': signInSvg,
  'translate': translateSvg,
  'arrow-left': arrowLeftSvg,
  'arrows-clockwise': arrowsClockwiseSvg,
  'camera': cameraSvg,
  'chart-bar': chartBarSvg,
  'check-circle': checkCircleSvg,
  'currency-inr': currencyInrSvg,
  'device-mobile': deviceMobileSvg,
  'download-simple': downloadSimpleSvg,
  'export': exportSvg,
  'fingerprint': fingerprintSvg,
  'gear': gearSvg,
  'google-logo': googleLogoSvg,
  'hourglass-medium': hourglassMediumSvg,
  'identification-card': identificationCardSvg,
  'image': imageSvg,
  'list': listSvg,
  'lock-simple': lockSimpleSvg,
  'magnifying-glass': magnifyingGlassSvg,
  'phone': phoneSvg,
  'plus': plusSvg,
  'question': questionSvg,
  'shield-check': shieldCheckSvg,
  'sign-out': signOutSvg,
  'spinner-gap': spinnerGapSvg,
  't-shirt': tShirtSvg,
  'ticket': ticketSvg,
  'trash': trashSvg,
  'user-plus': userPlusSvg,
  'users': usersSvg,
  'warning-circle': warningCircleSvg,
  'x': xSvg,
} as const;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  host: { 'aria-hidden': 'true', '[innerHTML]': 'svg()' },
  template: '',
})
export class IconComponent {
  private readonly sanitizer = inject(DomSanitizer);
  readonly name = input.required<IconName>();
  // Trusted: the markup comes from the bundled icon files above, never from user input.
  protected readonly svg = computed(() => this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()]));
}
