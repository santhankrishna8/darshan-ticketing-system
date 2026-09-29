import { Component, OnDestroy, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeasonService } from '../../core/season.service';
import { InstallButtonComponent } from '../../shared/install-button';
import { SiteFooterComponent } from '../../shared/site-footer';
import { SiteHeaderComponent } from '../../shared/site-header';
import { TourService } from '../../shared/tour';

@Component({
  selector: 'app-home',
  imports: [RouterLink, SiteHeaderComponent, SiteFooterComponent, InstallButtonComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnDestroy {
  protected readonly season = inject(SeasonService);
  private readonly tour = inject(TourService);

  protected readonly status = computed<'loading' | 'soon' | 'open' | 'full' | 'closed'>(() => {
    const s = this.season.settings();
    if (s === undefined) return 'loading';
    if (!s || !this.season.counter()) return 'soon';
    if (this.season.ticketsLeft() <= 0) return 'full';
    return s.registrationOpen ? 'open' : this.season.registered() > 0 ? 'closed' : 'soon';
  });

  protected readonly gallery = ['p9', 'p1', 'p10', 'p2', 'p7', 'p3', 'p5', 'p4', 'p8'].map(p => `assets/${p}.jpg`);

  constructor() {
    this.tour.offer('home', [
      {
        title: 'Welcome',
        titleTe: 'స్వాగతం',
        body: 'Register your family for Govindamala darshan in a few minutes. Here is a quick look around.',
        bodyTe: 'కొన్ని నిమిషాల్లో మీ కుటుంబానికి దర్శన టికెట్లు నమోదు చేసుకోండి.',
      },
      {
        target: '[data-tour=status]',
        title: 'Tickets left',
        titleTe: 'మిగిలిన టికెట్లు',
        body: 'This shows how many tickets are still available, live.',
        bodyTe: 'ఇంకా ఎన్ని టికెట్లు ఉన్నాయో ఇక్కడ కనిపిస్తుంది.',
      },
      {
        target: '[data-tour=register-cta]',
        title: 'Register',
        titleTe: 'నమోదు',
        body: 'Start here. Photograph each Aadhaar card and the details fill in by themselves.',
        bodyTe: 'ఇక్కడ మొదలుపెట్టండి. ఆధార్ కార్డు ఫోటో తీస్తే వివరాలు నిండుతాయి.',
      },
      {
        target: '[data-tour=ticket-cta]',
        title: 'Download your ticket',
        titleTe: 'టికెట్ డౌన్‌లోడ్',
        body: 'Lost the PDF? Get it again any time with an Aadhaar or phone number.',
        bodyTe: 'టికెట్ పోయిందా? ఆధార్ లేదా ఫోన్ నంబర్‌తో మళ్ళీ పొందండి.',
      },
      {
        target: '[data-tour=install]',
        title: 'Keep it on your phone',
        titleTe: 'ఫోన్‌లో యాప్‌గా',
        body: 'Add this site to your home screen to open it like an app.',
        bodyTe: 'హోమ్ స్క్రీన్‌కి జోడిస్తే యాప్‌లా తెరుచుకుంటుంది.',
      },
      {
        target: '[data-tour=help]',
        title: 'Help any time',
        titleTe: 'ఎప్పుడైనా సహాయం',
        body: 'Tap Help on any page to see its tour again.',
        bodyTe: 'ఏ పేజీలోనైనా Help నొక్కితే ఈ వివరణ మళ్ళీ చూడవచ్చు.',
      },
    ]);
  }

  ngOnDestroy(): void {
    this.tour.withdraw('home');
  }
}
