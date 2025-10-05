    // src/app/app.component.ts
    import { Component } from '@angular/core';
    import { RouterOutlet } from '@angular/router';
    import { CommonModule } from '@angular/common';
    import { FormsModule } from '@angular/forms';
import { LoginComponent } from './login/login.component';

    @Component({
      selector: 'app-root',
      templateUrl: './app.component.html',
      imports:[RouterOutlet,CommonModule,FormsModule,LoginComponent],
      styleUrls: ['./app.component.css'],
    })
    export class AppComponent  {
      title = 'శ్రీ వకుళమాత దేవి  గోవిందమాల  భక్త బృందం-2025';
    
    }
    

