// File: services/healthcare-profiles.service.ts
// Global Healthcare Professional Ecosystem
// Doctor, Nurse, Researcher, Student, Hospital, Clinic, Organization profiles

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import auditLogService, { AuditAction } from './audit-log.service';
import notificationService from './notification.service';

// ============================================================================
// TYPES — HEALTHCARE PROFESSIONALS
// ============================================================================

export type ProfessionalType =
  | 'doctor'
  | 'nurse'
  | 'researcher'
  | 'student'
  | 'pharmacist'
  | 'dentist'
  | 'therapist'
  | 'paramedic'
  | 'midwife'
  | 'radiographer'
  | 'dietitian'
  | 'physiotherapist'
  | 'other_healthcare';

export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'under_review'
  | 'verified'
  | 'rejected'
  | 'expired'
  | 'suspended';

export interface LicenseInfo {
  licenseNumber: string;
  issuingBody: string;       // e.g. "NMC", "GMC", "NMCN", "AMA"
  country: string;           // ISO 3166-1 alpha-2
  state?: string;
  specialty?: string;
  issueDate: Timestamp;
  expiryDate: Timestamp;
  licenseType: string;
  verificationStatus: VerificationStatus;
  verifiedAt?: Timestamp;
  documentUrls?: string[];   // uploaded credential scans
}

export interface HealthcareProfessionalProfile {
  id: string;
  userId: string;

  // Professional type
  type: ProfessionalType;
  title?: string;            // Dr., Prof., RN, etc.
  specializations: string[];
  subSpecializations?: string[];

  // Credentials
  qualifications: {
    degree: string;
    institution: string;
    country: string;
    year: number;
  }[];

  licenses: LicenseInfo[];
  primaryLicenseId?: string;

  // Work
  currentPosition?: string;
  currentInstitution?: string;
  institutionId?: string;    // links to Organization
  yearsExperience?: number;

  // Research (for researchers)
  researchAreas?: string[];
  publications?: number;
  orchidId?: string;
  googleScholarUrl?: string;

  // Student (for students)
  studyProgram?: string;
  expectedGraduationYear?: number;
  studentId?: string;

  // Global verification
  verificationStatus: VerificationStatus;
  verificationSubmittedAt?: Timestamp;
  verificationReviewedAt?: Timestamp;
  verificationReviewedBy?: string;
  verificationRejectionReason?: string;
  verifiedCountries: string[];    // countries where verified

  // Display
  bio?: string;
  languages: string[];
  acceptingPatients?: boolean;    // for doctors
  consultationTypes?: ('in_person' | 'telemedicine' | 'second_opinion')[];
  consultationFee?: number;
  currency?: string;

  // Analytics
  profileViews: number;
  connectionCount: number;
  endorsementCount: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// TYPES — ORGANIZATIONS
// ============================================================================

export type OrganizationType =
  | 'hospital'
  | 'clinic'
  | 'research_institute'
  | 'medical_school'
  | 'pharmacy'
  | 'diagnostic_lab'
  | 'telemedicine_platform'
  | 'ngo_health'
  | 'government_health'
  | 'medical_association'
  | 'other';

export interface Organization {
  id: string;
  adminUserId: string;

  type: OrganizationType;
  name: string;
  slug: string;
  description: string;
  about: string;

  // Location
  country: string;
  state?: string;
  city: string;
  address?: string;
  postalCode?: string;

  // Contact
  website?: string;
  email?: string;
  phone?: string;

  // Media
  logoUrl?: string;
  coverUrl?: string;
  galleryUrls?: string[];

  // Verification
  verificationStatus: VerificationStatus;
  accreditations?: string[];
  licenseNumber?: string;
  licenseIssuingBody?: string;
  verificationDocuments?: string[];
  verifiedAt?: Timestamp;

  // Members
  memberCount: number;
  staffCount?: number;
  departments?: string[];
  services?: string[];

  // Social
  followerCount: number;
  isOpen: boolean;           // accepting new followers/members
  isHiring: boolean;

  // Analytics
  postCount: number;
  profileViews: number;
  rating?: number;
  reviewCount?: number;

  // Moderation
  isFeatured: boolean;
  isVerifiedOrg: boolean;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Country → regulatory body mapping (expandable)
const REGULATORY_BODIES: Record<string, string[]> = {
  US: ['AMA', 'ABMS', 'AANP', 'AANA', 'NMC_US'],
  GB: ['GMC', 'NMC', 'GDC', 'GPhC', 'HCPC'],
  NG: ['MDCN', 'NMCN', 'PCN', 'RRBN', 'MLSCN'],
  GH: ['MDC', 'NMCGH'],
  ZA: ['HPCSA'],
  IN: ['MCI', 'NMC_IN', 'INC', 'PCI'],
  AU: ['AHPRA'],
  CA: ['CPSO', 'CPSBC', 'CPSA', 'CPSM'],
  DE: ['Bundesärztekammer', 'Pflegekammer'],
  FR: ['CNOM', 'CNOMK'],
  BR: ['CFM', 'COREN'],
  KE: ['KMPDC', 'NCK'],
  EG: ['EMSA'],
  JP: ['JMA'],
  CN: ['CMA'],
  SG: ['SMC', 'SNB'],
};

// ============================================================================
// HEALTHCARE PROFILES SERVICE
// ============================================================================

class HealthcareProfilesService {
  private db = getFirestore();

  // ========================================================================
  // PROFESSIONAL PROFILES
  // ========================================================================

  /**
   * Create or update professional profile
   */
  async upsertProfessionalProfile(
    userId: string,
    data: Partial<Omit<HealthcareProfessionalProfile, 'id' | 'userId' | 'createdAt' | 'verificationStatus'>>
  ): Promise<HealthcareProfessionalProfile> {
    const existing = await getDoc(
      doc(this.db, 'healthcare_profiles', userId)
    );

    if (existing.exists()) {
      await updateDoc(doc(this.db, 'healthcare_profiles', userId), {
        ...data,
        updatedAt: Timestamp.now(),
      });
      return { ...existing.data(), ...data, id: userId } as HealthcareProfessionalProfile;
    } else {
      const profile: HealthcareProfessionalProfile = {
        id: userId,
        userId,
        type: data.type || 'doctor',
        specializations: data.specializations || [],
        qualifications: data.qualifications || [],
        licenses: data.licenses || [],
        verificationStatus: 'unverified',
        verifiedCountries: [],
        languages: data.languages || [],
        profileViews: 0,
        connectionCount: 0,
        endorsementCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        ...data,
      };

      await setDoc(doc(this.db, 'healthcare_profiles', userId), profile);

      // Update user doc with professional type
      await updateDoc(doc(this.db, 'users', userId), {
        isProfessional: true,
        professionalType: profile.type,
        updatedAt: Timestamp.now(),
      });

      return profile;
    }
  }

  /**
   * Submit verification request with license details
   */
  async submitVerification(
    userId: string,
    licenseInfo: Omit<LicenseInfo, 'verificationStatus' | 'verifiedAt'>,
    additionalDocuments?: string[]
  ): Promise<void> {
    const profileSnap = await getDoc(
      doc(this.db, 'healthcare_profiles', userId)
    );
    if (!profileSnap.exists()) throw new Error('Professional profile not found');

    const license: LicenseInfo = {
      ...licenseInfo,
      verificationStatus: 'pending',
      documentUrls: additionalDocuments,
    };

    const profile = profileSnap.data() as HealthcareProfessionalProfile;
    const licenses = [...(profile.licenses || []), license];

    await updateDoc(doc(this.db, 'healthcare_profiles', userId), {
      licenses,
      verificationStatus: 'pending',
      verificationSubmittedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Create verification request doc
    await addDoc(collection(this.db, 'verification_requests'), {
      userId,
      type: 'healthcare_license',
      licenseInfo: license,
      status: 'pending',
      submittedAt: Timestamp.now(),
      country: licenseInfo.country,
      regulatoryBody: licenseInfo.issuingBody,
    });

    // Update user doc
    await updateDoc(doc(this.db, 'users', userId), {
      verificationStatus: 'pending',
      updatedAt: Timestamp.now(),
    });

    // Notify admins
    await addDoc(collection(this.db, 'admin_notifications'), {
      type: 'verification_pending',
      userId,
      licenseInfo,
      createdAt: Timestamp.now(),
      priority: 'medium',
      isRead: false,
    });
  }

  /**
   * Approve verification (admin action)
   */
  async approveVerification(
    userId: string,
    adminId: string,
    licenseNumber: string,
    country: string
  ): Promise<void> {
    const profileSnap = await getDoc(
      doc(this.db, 'healthcare_profiles', userId)
    );
    if (!profileSnap.exists()) throw new Error('Profile not found');
    const profile = profileSnap.data() as HealthcareProfessionalProfile;

    // Update the matching license
    const licenses = profile.licenses.map(l =>
      l.licenseNumber === licenseNumber && l.country === country
        ? { ...l, verificationStatus: 'verified' as VerificationStatus, verifiedAt: Timestamp.now() }
        : l
    );

    const verifiedCountries = [
      ...new Set([...(profile.verifiedCountries || []), country]),
    ];

    const batch = writeBatch(this.db);

    batch.update(doc(this.db, 'healthcare_profiles', userId), {
      licenses,
      verificationStatus: 'verified',
      verificationReviewedAt: Timestamp.now(),
      verificationReviewedBy: adminId,
      verifiedCountries,
      updatedAt: Timestamp.now(),
    });

    batch.update(doc(this.db, 'users', userId), {
      isVerified: true,
      verificationStatus: 'verified',
      verifiedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await batch.commit();

    await auditLogService.log(
      AuditAction.USER_VERIFIED,
      { userId: adminId, email: '', ipAddress: '' },
      { type: 'user', id: userId },
      { metadata: { licenseNumber, country } }
    );

    await notificationService.sendNotification({
      userId,
      type: 'verification_approved',
      title: 'Professional Verification Approved ✓',
      message:
        'Your healthcare credentials have been verified. Your profile now displays a verified badge.',
      data: { country },
    });
  }

  /**
   * Reject verification
   */
  async rejectVerification(
    userId: string,
    adminId: string,
    reason: string
  ): Promise<void> {
    const batch = writeBatch(this.db);

    batch.update(doc(this.db, 'healthcare_profiles', userId), {
      verificationStatus: 'rejected',
      verificationRejectionReason: reason,
      verificationReviewedAt: Timestamp.now(),
      verificationReviewedBy: adminId,
      updatedAt: Timestamp.now(),
    });

    batch.update(doc(this.db, 'users', userId), {
      verificationStatus: 'rejected',
      updatedAt: Timestamp.now(),
    });

    await batch.commit();

    await notificationService.sendNotification({
      userId,
      type: 'verification_rejected',
      title: 'Verification Not Approved',
      message: `Your verification was not approved. Reason: ${reason}. You may resubmit with correct documentation.`,
      data: { reason },
    });
  }

  /**
   * Get verified professionals directory
   */
  async getVerifiedProfessionals(filters: {
    type?: ProfessionalType;
    country?: string;
    specialization?: string;
    limit?: number;
  }): Promise<HealthcareProfessionalProfile[]> {
    let conditions: any[] = [
      where('verificationStatus', '==', 'verified'),
    ];

    if (filters.type) conditions.push(where('type', '==', filters.type));
    if (filters.country) {
      conditions.push(
        where('verifiedCountries', 'array-contains', filters.country)
      );
    }

    const q = query(
      collection(this.db, 'healthcare_profiles'),
      ...conditions,
      orderBy('connectionCount', 'desc'),
      limit(filters.limit || 50)
    );

    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as HealthcareProfessionalProfile));
  }

  /**
   * Get regulatory bodies for a country
   */
  getRegulatoryBodies(country: string): string[] {
    return REGULATORY_BODIES[country] || [];
  }

  /**
   * Increment profile views
   */
  async incrementProfileViews(userId: string): Promise<void> {
    const snap = await getDoc(doc(this.db, 'healthcare_profiles', userId));
    if (snap.exists()) {
      const data = snap.data() as HealthcareProfessionalProfile;
      await updateDoc(doc(this.db, 'healthcare_profiles', userId), {
        profileViews: (data.profileViews || 0) + 1,
      });
    }
  }

  // ========================================================================
  // ORGANIZATIONS
  // ========================================================================

  /**
   * Create organization page
   */
  async createOrganization(
    adminUserId: string,
    data: Omit<Organization, 'id' | 'adminUserId' | 'memberCount' | 'followerCount' | 'postCount' | 'profileViews' | 'isFeatured' | 'isVerifiedOrg' | 'verificationStatus' | 'createdAt' | 'updatedAt'>
  ): Promise<Organization> {
    const org: Omit<Organization, 'id'> = {
      adminUserId,
      memberCount: 1,
      followerCount: 0,
      postCount: 0,
      profileViews: 0,
      isFeatured: false,
      isVerifiedOrg: false,
      verificationStatus: 'unverified',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...data,
    };

    const ref = await addDoc(collection(this.db, 'organizations'), org);

    // Add admin as first member
    await addDoc(collection(this.db, 'organization_members'), {
      orgId: ref.id,
      userId: adminUserId,
      role: 'admin',
      joinedAt: Timestamp.now(),
    });

    return { ...org, id: ref.id } as Organization;
  }

  /**
   * Update organization
   */
  async updateOrganization(
    orgId: string,
    adminUserId: string,
    updates: Partial<Organization>
  ): Promise<void> {
    const orgSnap = await getDoc(doc(this.db, 'organizations', orgId));
    if (!orgSnap.exists()) throw new Error('Organization not found');
    const org = orgSnap.data() as Organization;
    if (org.adminUserId !== adminUserId) throw new Error('Not authorized');

    await updateDoc(doc(this.db, 'organizations', orgId), {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Follow organization
   */
  async followOrganization(orgId: string, userId: string): Promise<void> {
    await setDoc(
      doc(this.db, 'organization_follows', `${orgId}_${userId}`),
      { orgId, userId, followedAt: Timestamp.now() }
    );
    const orgSnap = await getDoc(doc(this.db, 'organizations', orgId));
    if (orgSnap.exists()) {
      await updateDoc(doc(this.db, 'organizations', orgId), {
        followerCount: (orgSnap.data().followerCount || 0) + 1,
      });
    }
  }

  /**
   * Get organizations directory
   */
  async getOrganizations(filters: {
    type?: OrganizationType;
    country?: string;
    verified?: boolean;
    limit?: number;
  }): Promise<Organization[]> {
    const conditions: any[] = [];
    if (filters.type) conditions.push(where('type', '==', filters.type));
    if (filters.country) conditions.push(where('country', '==', filters.country));
    if (filters.verified) conditions.push(where('isVerifiedOrg', '==', true));

    const q = query(
      collection(this.db, 'organizations'),
      ...conditions,
      orderBy('followerCount', 'desc'),
      limit(filters.limit || 50)
    );

    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Organization));
  }

  /**
   * Verify organization (admin)
   */
  async verifyOrganization(orgId: string, adminId: string): Promise<void> {
    await updateDoc(doc(this.db, 'organizations', orgId), {
      isVerifiedOrg: true,
      verificationStatus: 'verified',
      verifiedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    const org = (await getDoc(doc(this.db, 'organizations', orgId))).data() as Organization;
    await notificationService.sendNotification({
      userId: org.adminUserId,
      type: 'org_verified',
      title: 'Organization Verified ✓',
      message: `${org.name} has been verified on MedPulse.`,
      data: { orgId },
    });
  }

  /**
   * Add member to organization
   */
  async addMember(
    orgId: string,
    userId: string,
    role: 'admin' | 'moderator' | 'member' = 'member'
  ): Promise<void> {
    await setDoc(
      doc(this.db, 'organization_members', `${orgId}_${userId}`),
      { orgId, userId, role, joinedAt: Timestamp.now() }
    );
    const orgSnap = await getDoc(doc(this.db, 'organizations', orgId));
    if (orgSnap.exists()) {
      await updateDoc(doc(this.db, 'organizations', orgId), {
        memberCount: (orgSnap.data().memberCount || 0) + 1,
      });
    }
  }

  /**
   * Get pending verification requests (admin)
   */
  async getPendingVerifications(): Promise<any[]> {
    const q = query(
      collection(this.db, 'verification_requests'),
      where('status', '==', 'pending'),
      orderBy('submittedAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  }
}

export default new HealthcareProfilesService();
