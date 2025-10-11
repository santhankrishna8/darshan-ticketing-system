import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { Firestore, doc, collection, runTransaction, setDoc, getDoc, getDocs } from '@angular/fire/firestore';
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
  randomNames = ['Lokesh', 'Kishore', 'Kesava', 'Praveen', 'Siva', 'Dinesh', 'Hemanth', 'Manikanta', 'Bala Krishna', 'Preetham'];

  constructor(private fb: FormBuilder, private firestore: Firestore) {}

  ngOnInit() {
    this.devoteeForm = this.fb.group({
      members: this.fb.array([])
    });

    this.members.push(this.createMember());

    // Initialize tickets document
    const ticketDoc = doc(this.firestore, 'tickets', 'total');
    getDoc(ticketDoc).then(snapshot => {
      if (!snapshot.exists()) {
        setDoc(ticketDoc, { left: 470, lastAllocated: 0 });
      } else {
        const data = snapshot.data() as any;
        this.ticketsLeft = data?.['left'] ?? 470;
      }
    });
  }

  get members(): FormArray {
    return this.devoteeForm.get('members') as FormArray;
  }

  createMember(): FormGroup {
    return this.fb.group({
      name: ['', Validators.required],
      aadhar: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(12)]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      age: ['', [Validators.required, Validators.min(12), Validators.max(100)]],
      location: ['', Validators.required],
      paymentStatus: ['Not Paid']
    });
  }

  addMember() {
    if (this.members.length < this.maxMembers) this.members.push(this.createMember());
  }

  removeMember(index: number) {
    this.members.removeAt(index);
    if (this.members.length === 0) this.members.push(this.createMember());
  }

 async checkAadhar(index: number) {
  const memberGroup = this.members.at(index) as FormGroup;
  const aadhar = memberGroup.get('aadhar')?.value;

  if (!aadhar || aadhar.length !== 12) return;

  try {
    const devoteesCollection = collection(this.firestore, 'devotees');
    const snapshot = await getDocs(devoteesCollection);

    let exists = false;

    snapshot.forEach(docSnap => {
      const members = docSnap.data()['members'] || [];
      if (members.some((m: any) => m.aadhar === aadhar)) exists = true;
    });

    if (exists) {
      // Add control to mark invalid
      if (!memberGroup.get('aadharExists')) {
        memberGroup.addControl('aadharExists', this.fb.control(true));
      } else {
        memberGroup.get('aadharExists')?.setValue(true);
      }

      // ⚠️ Prevent form submission
      memberGroup.get('aadhar')?.setErrors({ duplicate: true });

      // Show SweetAlert
      await Swal.fire({
        icon: 'error',
        title: 'Duplicate Aadhar Found!',
        text: 'This Aadhar is already registered / ఈ ఆధార్ ఇప్పటికే నమోదు చేయబడింది You can download ticket/ 🎫 మీరు టికెట్‌ను డౌన్‌లోడ్ చేసుకోవచ్చు',
        confirmButtonText: 'OK'
      });
    } else {
      // Aadhaar unique → clear error
      if (memberGroup.get('aadharExists')) memberGroup.removeControl('aadharExists');
      memberGroup.get('aadhar')?.setErrors(null);
    }
  } catch (error) {
    console.error('Error checking Aadhar:', error);
  }
}

  async submitForm() {
    if (this.devoteeForm.invalid) return;

    const formData = this.members.value;
    const ticketDocRef = doc(this.firestore, 'tickets', 'total');
    const submissionCounterDocRef = doc(this.firestore, 'submissions', 'total');
    const devoteesCollection = collection(this.firestore, 'devotees');

    try {
      let submissionId = 1;

      let membersWithTickets: any[] = [];

      await runTransaction(this.firestore, async transaction => {
        const ticketSnapshot = await transaction.get(ticketDocRef);
        let ticketsLeft = 470;
        let lastAllocated = 0;

        if (ticketSnapshot.exists()) {
          const data = ticketSnapshot.data() as any;
          ticketsLeft = data?.['left'] ?? 470;
          lastAllocated = data?.['lastAllocated'] ?? 0;
        } else {
          transaction.set(ticketDocRef, { left: 470, lastAllocated: 0 });
        }

        if (ticketsLeft < formData.length) throw new Error('Not enough tickets left');

        const submissionSnapshot = await transaction.get(submissionCounterDocRef);
        if (submissionSnapshot.exists()) {
          const data = submissionSnapshot.data() as any;
          submissionId = (data?.['lastSubmissionId'] ?? 0) + 1;
        }
        transaction.set(submissionCounterDocRef, { lastSubmissionId: submissionId }, { merge: true });

        membersWithTickets = formData.map((m: any, i: number) => {
          const ticketNumber = lastAllocated + i + 1;
          const personIndex = Math.floor((ticketNumber - 1) / 50);
          const allocatedPerson = this.randomNames[personIndex] || this.randomNames[this.randomNames.length - 1];
          return { ...m, ticketNumber, allocatedPerson };
        });

        const devoteeDocRef = doc(devoteesCollection, submissionId.toString());
        transaction.set(devoteeDocRef, { members: membersWithTickets, submissionId, timestamp: new Date() });

        transaction.update(ticketDocRef, { left: ticketsLeft - formData.length, lastAllocated: lastAllocated + formData.length });
      });

      this.generatePDF(membersWithTickets, submissionId.toString());

      this.members.clear();
      this.members.push(this.createMember());

      Swal.fire({
        icon: 'success',
        title: 'Form submitted!',
        text: 'Submission ID: ' + submissionId,
        showConfirmButton: false,
        timer: 2500,
        position: 'center',
        customClass: { popup: 'rounded-xl shadow-lg' }
      });
    } catch (error: any) {
      console.error(error);
      Swal.fire({ icon: 'error', title: 'Error!', text: error.message || 'Something went wrong', confirmButtonText: 'OK' });
    }
  }

  generatePDF(data: any[], docId: string) {
    const docPdf = new jsPDF();
    docPdf.setFontSize(14);

    fetch('assets/header.png')
      .then(res => res.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          const headerHeight = 50;
          docPdf.addImage(base64, 'PNG', 10, 5, 190, headerHeight);
          docPdf.setFontSize(12);
          docPdf.text(`Document ID: ${docId}`, 20, headerHeight + 25);

          const tableData = data.map(m => [
            m.ticketNumber,
            m.name,
            m.age,
            m.aadhar,
            m.phone,
            m.location,
            m.allocatedPerson
          ]);

          autoTable(docPdf, {
            startY: headerHeight + 45,
            head: [['Ticket No.', 'Name', 'Age', 'Aadhar', 'Phone', 'Location', 'Allocated Person']],
            body: tableData,
            theme: 'grid',
            styles: { fontSize: 10 },
            headStyles: { fillColor: [41, 128, 185] }
          });

          docPdf.save(`${docId}_DevoteeDetails.pdf`);
        };
        reader.readAsDataURL(blob);
      });
  }
}
