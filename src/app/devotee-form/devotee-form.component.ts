import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { Firestore, doc, updateDoc, onSnapshot, collection, addDoc, getDoc, setDoc } from '@angular/fire/firestore';
import jsPDF from 'jspdf';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-devotee-form',
  standalone: true,
  templateUrl: './devotee-form.component.html',
  styleUrls: ['./devotee-form.component.css'],
  imports: [CommonModule, ReactiveFormsModule]
})
export class DevoteeFormComponent implements OnInit {
  devoteeForm!: FormGroup;
  ticketsLeft: number = 500; // default
  maxMembers = 10;

  constructor(private fb: FormBuilder, private firestore: Firestore) {}

  ngOnInit() {
    this.devoteeForm = this.fb.group({
      members: this.fb.array([this.createMember()])
    });

    // Ensure tickets doc exists
    const ticketDoc = doc(this.firestore, 'tickets/total');
    getDoc(ticketDoc).then(snapshot => {
      if (!snapshot.exists()) {
        setDoc(ticketDoc, { left: 500 }); // initialize
      }
    });

    // Listen for real-time ticket updates
    onSnapshot(ticketDoc, (snapshot) => {
      const data = snapshot.data();
      this.ticketsLeft = data ? (data['left'] as number) : 500;
    });
  }

  // Create new member form
  createMember(): FormGroup {
    return this.fb.group({
      name: ['', Validators.required],
      aadhar: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(12)]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      location: ['', Validators.required]
    });
  }

  get members(): FormArray {
    return this.devoteeForm.get('members') as FormArray;
  }

  // Add member row
  addMember() {
    if (this.members.length < this.maxMembers) {
      this.members.push(this.createMember());
    }
  }

  // Remove member row
  removeMember(index: number) {
    this.members.removeAt(index);
  }

  // Submit form
  async submitForm() {
    if (this.devoteeForm.invalid) return;

    const formData = this.devoteeForm.value.members;

    // Save to Firestore
    const devoteesCollection = collection(this.firestore, 'devotees');
    await addDoc(devoteesCollection, {
      members: formData,
      timestamp: new Date()
    });

    const ticketDoc = doc(this.firestore, 'tickets/total');
await setDoc(ticketDoc, {
  left: this.ticketsLeft - formData.length
}, { merge: true });


    // Generate PDF
    this.generatePDF(formData);

    alert('Form submitted successfully!');
    this.devoteeForm.reset();
    this.members.clear();
    this.members.push(this.createMember());
  }

  // Generate PDF
  generatePDF(data: any[]) {
    const docPdf = new jsPDF();
    docPdf.setFontSize(14);
    docPdf.text('Devotee Registration Details', 20, 20);

    let y = 30;
    data.forEach((m, i) => {
      if (y > 260) { // add page if overflow
        docPdf.addPage();
        y = 20;
      }
      docPdf.text(`${i + 1}. Name: ${m.name}`, 20, y);
      docPdf.text(`   Aadhar: ${m.aadhar}`, 20, y + 10);
      docPdf.text(`   Phone: ${m.phone}`, 20, y + 20);
      docPdf.text(`   Location: ${m.location}`, 20, y + 30);
      y += 40;
    });

    docPdf.save('DevoteeDetails.pdf');
  }
}
