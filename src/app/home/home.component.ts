import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink,RouterLinkActive,CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {

    slides: string[] = [
    'assets/p6.jpg',
    'assets/p9.jpg',
    'assets/p1.jpg',
    'assets/p10.jpg',
    'assets/p8.jpg',
    'assets/p4.jpg',
    'assets/p2.jpg',
    'assets/p3.jpg',
    'assets/p5.jpg',
    'assets/p7.jpg',
  ];

  currentSlide = 0;

  changeSlide(direction: number) {
    this.currentSlide = (this.currentSlide + direction + this.slides.length) % this.slides.length;
  }

}
