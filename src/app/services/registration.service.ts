import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
@Injectable({
  providedIn: 'root'
})
export class RegistrationService {

  constructor(private firestore: AngularFirestore) {}

  addRegistration(data: { name: string; aadhar: string; phone: string; location: string }) {
    return this.firestore.collection('registrations').add(data);
  }
}
