import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { Firestore, doc, collection, runTransaction, setDoc, getDoc } from '@angular/fire/firestore';
import jsPDF from 'jspdf';
import { CommonModule } from '@angular/common';
import autoTable from 'jspdf-autotable';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-devotee-form',
  standalone: true,
  templateUrl: './devotee-form.component.html',
  styleUrls: ['./devotee-form.component.css'],
  imports: [CommonModule, ReactiveFormsModule]
})
export class DevoteeFormComponent implements OnInit {
  devoteeForm!: FormGroup;
  ticketsLeft: number = 470;
  maxMembers = 10;
  randomNames = ['Lokesh','Kishore', 'Kesava', 'Praveen', 'Siva', 'Dinesh','Hemanth','Manikanta','Bala Krishna','Preetham'];

  constructor(private fb: FormBuilder, private firestore: Firestore) {}

  ngOnInit() {
    this.devoteeForm = this.fb.group({
      allocatedPerson: ['', Validators.required], // top-level dropdown
      members: this.fb.array([this.createMember()])
    });

    // Initialize tickets doc if not exist
    const ticketDoc = doc(this.firestore, 'tickets/total');
    getDoc(ticketDoc).then(snapshot => {
      if (!snapshot.exists()) {
        setDoc(ticketDoc, { left: 470, lastAllocated: 0 });
      } else {
        const data = snapshot.data();
        this.ticketsLeft = data?.['left'] ?? 470;
      }
    });
  }

  // Member form
  createMember(): FormGroup {
    return this.fb.group({
      name: ['', Validators.required],
      aadhar: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(12)]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      age:['',[Validators.required,Validators.min(12),Validators.max(100)]],
      location: ['', Validators.required]
    });
  }

  get members(): FormArray {
    return this.devoteeForm.get('members') as FormArray;
  }

  addMember() {
    if (this.members.length < this.maxMembers) {
      this.members.push(this.createMember());
    }
  }

  removeMember(index: number) {
    this.members.removeAt(index);
  }
async submitForm() {
  if (this.devoteeForm.invalid) return;

  const formData = this.devoteeForm.value.members;
  const allocatedPerson = this.devoteeForm.value.allocatedPerson;

  const ticketDocRef = doc(this.firestore, 'tickets/total');
  const submissionCounterDocRef = doc(this.firestore, 'submissions/total');
  const devoteesCollection = collection(this.firestore, 'devotees');

  try {
    let submissionId = 1;
    let membersWithTickets: any[] = [];

    await runTransaction(this.firestore, async (transaction) => {
      // Get ticket info
      const ticketSnapshot = await transaction.get(ticketDocRef);
      let ticketsLeft = 470;
      let lastAllocated = 0;

      if (ticketSnapshot.exists()) {
        const data = ticketSnapshot.data();
        ticketsLeft = data?.['left'] ?? 470;
        lastAllocated = data?.['lastAllocated'] ?? 0;
      } else {
        transaction.set(ticketDocRef, { left: 470, lastAllocated: 0 });
      }

      if (ticketsLeft < formData.length) {
        throw new Error('Not enough tickets left');
      }

      // Get submission ID
      const submissionSnapshot = await transaction.get(submissionCounterDocRef);
      if (submissionSnapshot.exists()) {
        const data = submissionSnapshot.data();
        submissionId = (data?.['lastSubmissionId'] ?? 0) + 1;
      }
      transaction.set(submissionCounterDocRef, { lastSubmissionId: submissionId }, { merge: true });

      // Allocate ticket numbers
      membersWithTickets = formData.map((m: any, index: number) => ({
        ...m,
        allocatedPerson,
        ticketNumber: lastAllocated + index + 1
      }));

      // Save members to Firestore **with submissionId as document ID**
      const devoteeDocRef = doc(devoteesCollection, submissionId.toString());
      transaction.set(devoteeDocRef, {
        allocatedPerson,
        members: membersWithTickets,
        submissionId,
        timestamp: new Date()
      });

      // Update tickets doc
      transaction.update(ticketDocRef, {
        left: ticketsLeft - formData.length,
        lastAllocated: lastAllocated + formData.length
      });
    });

    // Generate PDF outside transaction
    this.generatePDF(membersWithTickets, submissionId.toString(), allocatedPerson);

    // Reset form
    this.devoteeForm.reset();
    this.members.clear();
    this.members.push(this.createMember());

    // Success case
Swal.fire({
  icon: 'success',
  title: 'Form submitted!',
  text: 'Submission ID: ' + submissionId,
  showConfirmButton: false,
  timer: 2500,
  position: 'center',
  customClass: {
    popup: 'rounded-xl shadow-lg'
  }
});
  } catch (error: any) {
    console.error(error);
    alert(error.message || 'Something went wrong');
  }
}

  generatePDF(data: any[], docId: string, allocatedPerson: string) {
    const docPdf = new jsPDF();
    docPdf.setFontSize(14);

    fetch("assets/header.png")
      .then(res => res.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          const headerHeight = 50;

          // Add header
          docPdf.addImage(base64, "PNG", 10, 5, 190, headerHeight);
          // docPdf.text("Devotee Registration Details", 20, headerHeight + 15);
          docPdf.setFontSize(12);
          docPdf.text(`Document ID: ${docId}`, 20, headerHeight + 25);
          docPdf.text(`Allocated Person: ${allocatedPerson}`, 20, headerHeight + 35);

          // Prepare table data
          const tableData = data.map((m, i) => [
            m.ticketNumber,
            m.name,
            m.age,
            m.aadhar,
            m.phone,
            m.location
            
          ]);

          // Add table
          autoTable(docPdf, {
            startY: headerHeight + 45,
            head: [['Ticket No.', 'Name','Age', 'Aadhar', 'Phone', 'Location']],
            body: tableData,
            theme: 'grid',
            styles: { fontSize: 10 },
            headStyles: { fillColor: [41, 128, 185] }
          });

          // Save file
          docPdf.save(`${docId}_DevoteeDetails.pdf`);
        };
        reader.readAsDataURL(blob);
      });
  }
}
