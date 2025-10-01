import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Firestore, doc, updateDoc, onSnapshot, collection, addDoc, getDoc, setDoc, getDocs } from '@angular/fire/firestore';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-search',
  imports: [CommonModule, ReactiveFormsModule,FormsModule],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css'
})
export class SearchComponent {

  devoteeForm!: FormGroup;
  ticketsLeft: number = 500; // default
  maxMembers = 10;
searchControl: FormControl = new FormControl('');
searchResults: any[] = [];
searchAttempted = false;

 constructor( private firestore: Firestore) {}

  
  async searchDevotee() {
  const searchValue = this.searchControl.value.trim();
  this.searchResults = [];
  this.searchAttempted = true;

  if (!searchValue) return;

  const devoteesCollection = collection(this.firestore, 'devotees');

  try {
    const snapshot = await getDocs(devoteesCollection);
    
    snapshot.forEach(docSnap => {
      const members = docSnap.data()['members'] || [];
      members.forEach((m: any) => {
        if (
          m.name.toLowerCase().includes(searchValue.toLowerCase()) ||
          m.aadhar.includes(searchValue) ||
          m.phone.includes(searchValue)
        ) {
          this.searchResults.push(m);
        }
      });
    });
  } catch (error) {
    console.error('Search error:', error);
  }
}


}
