import { Component } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { RouterLink, RouterLinkActive } from '@angular/router';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Firestore, collection, doc, getDocs, runTransaction, updateDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin',
  imports: [RouterLink, RouterLinkActive, FormsModule, CommonModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent {
  username: string | null = '';
  menuOpen = false;

  selectedPerson: string = '';
  personTicketsCount: number = -1; // initially hidden
  personMembers: any[] = [];
  showMembers: boolean = false;

  randomNames = ['Lokesh','Kishore', 'Kesava', 'Praveen', 'Siva', 'Dinesh','Hemanth','Manikanta','Bala Krishna','Preetham'];

  constructor(private authService: AuthService, private firestore: Firestore) {}

  ngOnInit(): void {
    this.username = localStorage.getItem('username');
  }

  toggleMenu() { this.menuOpen = !this.menuOpen; }

  logout() { this.authService.logout(); }

  // Fetch members under selected allocatedPerson
  async fetchPersonTickets() {
    if (!this.selectedPerson) return;

    try {
      const devoteesCollection = collection(this.firestore, 'devotees');
      const snapshot = await getDocs(devoteesCollection);

      const members: any[] = [];
     snapshot.forEach(doc => {
  const data = doc.data();
  if (data['members'] && Array.isArray(data['members'])) {
    data['members'].forEach((m: any) => {
      if (m.allocatedPerson === this.selectedPerson) {
        if (!m.paymentStatus) m.paymentStatus = 'Not Paid';
        m.submissionId = data['submissionId']; // <-- Needed to update later
        members.push(m);
      }
    });
  }
});

      this.personTicketsCount = members.length;
      this.personMembers = members;
      this.showMembers = false; // hide table until "View Members" clicked
    } catch (error) {
      console.error(error);
      alert('Error fetching tickets!');
    }
  }

  viewMembers() { this.showMembers = true; }

  downloadMembers() {
    if (this.personMembers.length === 0) return;

    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(
      this.personMembers.map(m => ({
        TicketNumber: m.ticketNumber,
        Name: m.name,
        Age: m.age,
        Aadhar: m.aadhar,
        Phone: m.phone,
        Location: m.location,
        Payment:m.paymentStatus
      }))
    );

    // Style header
    const headerRange = XLSX.utils.decode_range(ws['!ref']!);
    for (let C = headerRange.s.c; C <= headerRange.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[cellAddress]) continue;
      ws[cellAddress].s = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
        fill: { fgColor: { rgb: "2980B9" } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${this.selectedPerson}_Tickets`);

    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric',
      hour12: true
    };
    const formattedDate = now.toLocaleString('en-US', options).replace(',', '');
    const fileName = `${formattedDate} ${this.selectedPerson} Tickets.xlsx`;

    const excelBuffer: any = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
    const blobData = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blobData, fileName);
  }

  // Export all devotees
  async exportToExcel() {
    try {
      const devoteesCollection = collection(this.firestore, 'devotees');
      const snapshot = await getDocs(devoteesCollection);

      if (snapshot.empty) {
        alert('No data found!');
        return;
      }

      const excelData: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data['members'] && Array.isArray(data['members'])) {
          data['members'].forEach((m: any) => {
            excelData.push({
              SubmissionID: data['submissionId'],
              AllocatedPerson: m.allocatedPerson,
              TicketNumber: m.ticketNumber,
              Name: m.name,
              Age: m.age,
              Aadhar: m.aadhar,
              Phone: m.phone,
              Location: m.location
              // Timestamp: m.timestamp?.toDate ? m.timestamp.toDate() : m.timestamp
            });
          });
        }
      });

      const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(excelData);
      const wb: XLSX.WorkBook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Devotees');

      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric',
        hour12: true
      };
      const formattedDate = now.toLocaleString('en-US', options).replace(',', '');
      const fileName = `${formattedDate}_Devotee Details.xlsx`;

      const excelBuffer: any = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
      const blobData = new Blob([excelBuffer], { type: 'application/octet-stream' });
      saveAs(blobData, fileName);

    } catch (error) {
      console.error(error);
      alert('Error exporting to Excel');
    }
  }



 async togglePaymentStatus(member: any, index: number) {
  try {
    // Toggle locally
    member.paymentStatus = member.paymentStatus === 'Paid' ? 'Not Paid' : 'Paid';

    // Find the Firestore document for this member
    const devoteeDocRef = doc(this.firestore, 'devotees', member.submissionId.toString());

    // Update only this member's paymentStatus in the array
    await runTransaction(this.firestore, async (transaction) => {
      const docSnap = await transaction.get(devoteeDocRef);
      if (!docSnap.exists()) throw new Error('Devotee document not found');

      const data = docSnap.data() as any;
      const updatedMembers = data.members.map((m: any) => {
        if (m.ticketNumber === member.ticketNumber) {
          return { ...m, paymentStatus: member.paymentStatus };
        }
        return m;
      });

      transaction.update(devoteeDocRef, { members: updatedMembers });
    });

    console.log(`Payment status updated for ticket ${member.ticketNumber}`);
  } catch (error) {
    console.error('Failed to update payment status:', error);
    alert('Failed to update payment status');
    // Revert toggle locally if error occurs
    member.paymentStatus = member.paymentStatus === 'Paid' ? 'Not Paid' : 'Paid';
  }
}

}
