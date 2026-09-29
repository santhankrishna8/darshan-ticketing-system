import { Gender } from '../aadhaar/aadhaar.types';

export type PaymentStatus = 'Paid' | 'Not Paid';

/** seasons/{season}: one document per year, holding that year's settings. */
export interface SeasonSettings {
  season: string;
  eventTitleTe: string;
  eventTitleEn: string;
  placeTe: string;
  placeEn: string;
  darshanDate: string; // free text, e.g. "18 December 2026"
  totalTickets: number;
  maxPerGroup: number;
  minAge: number;
  maxAge: number;
  fee: number;
  paymentPlaceTe: string;
  paymentPlaceEn: string;
  dressCodeTe: string;
  dressCodeEn: string;
  contactName: string;
  contactPhone: string;
  registrationOpen: boolean;
  /** Tickets are handed to coordinators in blocks: tickets 1-50 to the first, 51-100 to the second, ... */
  coordinators: string[];
  ticketsPerCoordinator: number;
}

/** seasons/{season}/meta/counter */
export interface Counter {
  lastTicket: number;
  lastSubmission: number;
  lastRegistrationId: string;
}

export interface MemberInput {
  name: string;
  aadhaar: string;
  age: number;
  gender: Gender | '';
  dob?: string;
  phone: string;
  address: string;
  scanned: boolean;
}

/** One devotee inside a registration. The full Aadhaar number lives only in the staff-only index. */
export interface Member {
  ticketNumber: number;
  name: string;
  age: number;
  gender: Gender | '';
  dob: string;
  aadhaarLast4: string;
  phone: string;
  address: string;
  coordinator: string;
  paymentStatus: PaymentStatus;
  scanned: boolean;
}

/** seasons/{season}/registrations/{id}: one group submission. */
export interface Registration {
  id: string;
  submissionNo: number;
  firstTicket: number;
  members: Member[];
  createdAt?: { toDate(): Date } | null;
  createdBy: string | null;
}

/** seasons/{season}/aadhaar/{sha256}: duplicate check + lookup; staff can list it for exports. */
export interface AadhaarIndex {
  aadhaar: string;
  registrationId: string;
  ticketNumber: number;
}

export type StaffRole = 'admin' | 'volunteer';
export type StaffStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

/** seasons/{season}/staff/{uid}: an access request that the main admin approves. */
export interface StaffMember {
  uid: string;
  email: string;
  name: string;
  photoURL: string;
  status: StaffStatus;
  role: StaffRole;
  biometricAllowed: boolean;
  requestedAt?: { toDate(): Date } | null;
  decidedBy?: string;
}

export const DEFAULT_SETTINGS = (season: string): SeasonSettings => ({
  season,
  eventTitleTe: 'శ్రీ వకుళమాత దేవి గోవిందమాల భక్త బృందం',
  eventTitleEn: 'Sri Vakulamatha Devi Govindamala Bhakta Brundam',
  placeTe: 'పేరూరు గ్రామం, తిరుపతి రూరల్',
  placeEn: 'Peruru village, Tirupati Rural',
  darshanDate: '',
  totalTickets: 600,
  maxPerGroup: 10,
  minAge: 12,
  maxAge: 100,
  fee: 300,
  paymentPlaceTe: 'పేరూరు శ్రీ కృష్ణ భజన మందిరం వద్ద చెల్లించండి',
  paymentPlaceEn: 'Pay at Peruru Sri Krishna Bhajana Mandiram',
  dressCodeTe: 'దర్శనానికి పసుపు రంగు దుస్తులు తప్పనిసరి',
  dressCodeEn: 'Yellow attire is mandatory for darshan',
  contactName: 'వి. బాలకృష్ణ',
  contactPhone: '9347580090',
  registrationOpen: true,
  coordinators: [],
  ticketsPerCoordinator: 50,
});
