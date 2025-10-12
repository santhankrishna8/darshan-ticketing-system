import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Firestore, collection, getDocs, doc, getDoc } from '@angular/fire/firestore';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css'
})
export class SearchComponent {

  searchControl: FormControl = new FormControl('');
  searchResults: any[] = [];
  searchAttempted = false;

  constructor(private firestore: Firestore) {}

  async searchDevotee() {
  const searchValue = this.searchControl.value?.trim();
  this.searchResults = [];
  this.searchAttempted = true;

  if (!searchValue) return;

  const devoteesCollection = collection(this.firestore, 'devotees');

  try {
    const snapshot = await getDocs(devoteesCollection);

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const members = data['members'] || [];
      const submissionId = docSnap.id;

      members.forEach((m: any) => {
        const name = (m.name || '').toLowerCase();
        const aadhar = String(m.aadhar || '');
        const phone = String(m.phone || '');

        if (
          name.includes(searchValue.toLowerCase()) ||
          aadhar.includes(searchValue) ||
          phone.includes(searchValue)
        ) {
          this.searchResults.push({ ...m, submissionId });
        }
      });
    });

    console.log('Results:', this.searchResults); // 👈 for debugging
  } catch (error) {
    console.error('Search error:', error);
  }
}


  async downloadTicket(submissionId: string) {
    try {
      const docRef = doc(this.firestore, 'devotees', submissionId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const members = data['members'] || [];
        const allocatedPerson = members[0]?.allocatedPerson || '';

        // ✅ Use your table-based PDF function
        this.generatePDF(members, submissionId, allocatedPerson);
      } else {
        console.error('Ticket not found.');
      }
    } catch (error) {
      console.error('Download error:', error);
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

          // Add header image
          docPdf.addImage(base64, "PNG", 10, 5, 190, headerHeight);

          docPdf.setFontSize(12);
          docPdf.text(`Document ID: ${docId}`, 20, headerHeight + 25);
          // docPdf.text(`Allocated Person: ${allocatedPerson}`, 20, headerHeight + 35);

          // Prepare table data
          const tableData = data.map((m, i) => [
            m.ticketNumber,
            m.name,
            m.aadhar,
            m.phone,
            m.location,
            m.allocatedPerson
          ]);

          // Add table
          autoTable(docPdf, {
            startY: headerHeight + 45,
            head: [['Ticket No.', 'Name', 'Aadhar', 'Phone', 'Location',"Allocated Person"]],
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
