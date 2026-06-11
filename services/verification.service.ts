import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { VerificationRequest, VerificationStatus } from '@/types';

/**
 * Create verification request
 */
export async function createVerificationRequest(
  userId: string,
  type: 'student' | 'doctor' | 'institution' | 'creator',
  documents: any[]
): Promise<VerificationRequest> {
  const db = getFirebaseDb();
  const requestRef = doc(collection(db, 'verification_requests'));

  const request: VerificationRequest = {
    id: requestRef.id,
    userId,
    type,
    status: 'pending',
    documents,
    submittedAt: new Date(),
    metadata: {},
  };

  await setDoc(requestRef, {
    ...request,
    submittedAt: Timestamp.fromDate(request.submittedAt),
  });

  return request;
}

/**
 * Get verification request
 */
export async function getVerificationRequest(
  requestId: string
): Promise<VerificationRequest | null> {
  try {
    const db = getFirebaseDb();
    const docSnap = await getDoc(doc(db, 'verification_requests', requestId));

    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    return {
      ...data,
      submittedAt: data.submittedAt?.toDate?.() || new Date(data.submittedAt),
      reviewedAt: data.reviewedAt?.toDate?.() || undefined,
    } as VerificationRequest;
  } catch (error) {
    console.error('Error getting verification request:', error);
    return null;
  }
}

/**
 * Get user's verification requests
 */
export async function getUserVerificationRequests(
  userId: string
): Promise<VerificationRequest[]> {
  try {
    const db = getFirebaseDb();
    const snapshot = await getDocs(
      query(
        collection(db, 'verification_requests'),
        where('userId', '==', userId),
        orderBy('submittedAt', 'desc')
      )
    );

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        submittedAt: data.submittedAt?.toDate?.() || new Date(data.submittedAt),
        reviewedAt: data.reviewedAt?.toDate?.() || undefined,
      } as VerificationRequest;
    });
  } catch (error) {
    console.error('Error getting user verification requests:', error);
    return [];
  }
}

/**
 * Update verification request status
 */
export async function updateVerificationStatus(
  requestId: string,
  status: VerificationStatus,
  reviewedBy?: string,
  rejectionReason?: string
): Promise<void> {
  try {
    const db = getFirebaseDb();
    await updateDoc(doc(db, 'verification_requests', requestId), {
      status,
      reviewedAt: Timestamp.now(),
      reviewedBy: reviewedBy || null,
      rejectionReason: rejectionReason || null,
    });
  } catch (error) {
    console.error('Error updating verification status:', error);
  }
}

/**
 * Get pending verification requests (for admin dashboard)
 */
export async function getPendingVerificationRequests(): Promise<VerificationRequest[]> {
  try {
    const db = getFirebaseDb();
    const snapshot = await getDocs(
      query(
        collection(db, 'verification_requests'),
        where('status', '==', 'pending'),
        orderBy('submittedAt', 'asc')
      )
    );

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        submittedAt: data.submittedAt?.toDate?.() || new Date(data.submittedAt),
        reviewedAt: data.reviewedAt?.toDate?.() || undefined,
      } as VerificationRequest;
    });
  } catch (error) {
    console.error('Error getting pending verification requests:', error);
    return [];
  }
}
