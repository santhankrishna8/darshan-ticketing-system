import { Registration, SeasonSettings } from './models';

const W = 1240; // A4 at 150 dpi
const H = 1754;
const C = {
  paper: '#ffffff',
  ink: '#000000',
  muted: '#525252',
  kumkum: '#000000',
  line: '#e4e4e4',
};

/**
 * Draws the ticket on a canvas (so Telugu text is shaped correctly by the browser)
 * and wraps it in a one-page PDF.
 */
export async function downloadTicketPdf(reg: Registration, s: SeasonSettings): Promise<void> {
  await Promise.all([
    document.fonts.load('400 40px "Noto Sans Telugu"', 'శ్రీ'),
    document.fonts.load('600 24px "Noto Sans Telugu"', 'పేరు'),
    document.fonts.load('500 24px "Geist Sans"', 'Name'),
    document.fonts.load('600 24px "Geist Sans"', 'Name'),
  ]).catch(() => undefined);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  // Thin border.
  ctx.strokeStyle = C.kumkum;
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 56, W - 112, H - 112);

  // Header band.
  ctx.fillStyle = C.kumkum;
  ctx.fillRect(56, 56, W - 112, 220);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff6e6';
  ctx.font = '600 22px "Geist Sans", "Noto Sans Telugu", sans-serif';
  ctx.fillText('ఓం నమో వేంకటేశాయ', W / 2, 108);
  ctx.font = '400 44px "Geist Sans", "Noto Sans Telugu", sans-serif';
  ctx.fillText(s.eventTitleTe, W / 2, 168, W - 200);
  ctx.font = '500 24px "Geist Sans", "Noto Sans Telugu", sans-serif';
  ctx.fillText(`${s.eventTitleEn}  |  ${s.placeEn}`, W / 2, 218, W - 200);

  ctx.fillStyle = C.ink;
  ctx.font = '400 40px "Geist Sans", "Noto Sans Telugu", sans-serif';
  ctx.fillText(`దర్శన టికెట్  Darshan Ticket ${s.season}`, W / 2, 360);
  if (s.darshanDate) {
    ctx.font = '500 26px "Geist Sans", "Noto Sans Telugu", sans-serif';
    ctx.fillStyle = C.muted;
    ctx.fillText(s.darshanDate, W / 2, 402);
  }

  // Group summary.
  ctx.textAlign = 'left';
  let y = 470;
  const summary: [string, string][] = [
    ['Registration no.', `#${reg.submissionNo}`],
    ['Tickets', ticketRange(reg)],
    ['Devotees', String(reg.members.length)],
  ];
  const colW = (W - 200) / 3;
  summary.forEach(([k, v], i) => {
    const x = 100 + i * colW;
    ctx.fillStyle = C.muted;
    ctx.font = '500 22px "Geist Sans", "Noto Sans Telugu", sans-serif';
    ctx.fillText(k, x, y);
    ctx.fillStyle = C.kumkum;
    ctx.font = '600 38px "Geist Sans", "Noto Sans Telugu", sans-serif';
    ctx.fillText(v, x, y + 46);
  });

  // Devotee table.
  y = 590;
  const cols = [
    { h: 'Ticket', x: 100, w: 110 },
    { h: 'Name / పేరు', x: 210, w: 360 },
    { h: 'Age', x: 570, w: 70 },
    { h: 'Aadhaar', x: 640, w: 170 },
    { h: 'Phone', x: 810, w: 170 },
    { h: 'Coordinator', x: 980, w: 160 },
  ];
  const showCoordinator = reg.members.some(m => m.coordinator);
  const visible = showCoordinator ? cols : cols.slice(0, 5);
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(90, y - 36, W - 180, 54);
  ctx.fillStyle = C.ink;
  ctx.font = '600 22px "Geist Sans", "Noto Sans Telugu", sans-serif';
  visible.forEach(c => ctx.fillText(c.h, c.x, y));

  const rowH = Math.min(74, Math.floor(620 / Math.max(1, reg.members.length)));
  y += 18;
  for (const m of reg.members) {
    y += rowH;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(90, y + 22);
    ctx.lineTo(W - 90, y + 22);
    ctx.stroke();
    ctx.fillStyle = C.kumkum;
    ctx.font = '600 30px "Geist Sans", "Noto Sans Telugu", sans-serif';
    ctx.fillText(String(m.ticketNumber), cols[0].x, y);
    ctx.fillStyle = C.ink;
    ctx.font = '500 24px "Geist Sans", "Noto Sans Telugu", sans-serif';
    ctx.fillText(m.name, cols[1].x, y, cols[1].w - 20);
    ctx.fillText(String(m.age), cols[2].x, y);
    ctx.fillText(`XXXX ${m.aadhaarLast4}`, cols[3].x, y);
    ctx.fillText(m.phone, cols[4].x, y);
    if (showCoordinator) ctx.fillText(m.coordinator, cols[5].x, y, cols[5].w);
  }

  // Instructions.
  y = Math.max(y + 90, 1330);
  ctx.fillStyle = C.kumkum;
  ctx.font = '400 32px "Geist Sans", "Noto Sans Telugu", sans-serif';
  ctx.fillText('గమనిక  Please note', 100, y);
  ctx.font = '500 23px "Geist Sans", "Noto Sans Telugu", sans-serif';
  const notes = [
    `దర్శన రుసుము ₹${s.fee}. ${s.paymentPlaceTe}.`,
    `Darshan fee ₹${s.fee}. ${s.paymentPlaceEn}.`,
    'ఆధార్ కార్డు జెరాక్స్ సమర్పించవలెను.  Bring a photocopy of each Aadhaar card.',
    `${s.dressCodeTe}.  ${s.dressCodeEn}.`,
  ];
  ctx.fillStyle = C.ink;
  notes.forEach((n, i) => ctx.fillText(n, 100, y + 50 + i * 42, W - 200));

  ctx.textAlign = 'center';
  ctx.fillStyle = C.muted;
  ctx.font = '500 22px "Geist Sans", "Noto Sans Telugu", sans-serif';
  ctx.fillText(`వివరాలకు ${s.contactName}  ${formatPhone(s.contactPhone)}`, W / 2, H - 100);

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
  pdf.save(`Darshan-Ticket-${s.season}-${reg.submissionNo}.pdf`);
}

function ticketRange(reg: Registration): string {
  const nums = reg.members.map(m => m.ticketNumber).sort((a, b) => a - b);
  return nums.length > 1 ? `${nums[0]} - ${nums[nums.length - 1]}` : String(nums[0]);
}

export function formatPhone(p: string): string {
  return p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}
