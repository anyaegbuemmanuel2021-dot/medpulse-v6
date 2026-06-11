import { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, query, where, getDocs, collection } from 'firebase/firestore';
import { getFirebaseDb, getFirebaseAuth } from '@/lib/firebase';
import { User, UserRole } from '@/types';

/**
 * Create a user document in Firestore
 */
export async function createUserDocument(
  firebaseUser: FirebaseUser,
  role: UserRole = 'student'
): Promise<User> {
  const db = getFirebaseDb();
  
  const user: User = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName || 'Anonymous',
    photoURL: firebaseUser.photoURL || undefined,
    bio: '',
    specialties: [],
    roles: [role],
    verification: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    metadata: {
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      totalEngagement: 0,
      lastLoginAt: new Date(),
      deviceFingerprints: [],
    },
  };

  await setDoc(doc(db, 'users', firebaseUser.uid), user);
  return user;
}

/**
 * Get user document from Firestore
 */
export async function getUserDocument(uid: string): Promise<User | null> {
  try {
    const db = getFirebaseDb();
    const userDoc = await getDoc(doc(db, 'users', uid));
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
      } as User;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting user document:', error);
    return null;
  }
}

/**
 * Update user document
 */
export async function updateUserDocument(
  uid: string,
  data: Partial<User>
): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'users', uid), {
    ...data,
    updatedAt: new Date(),
  });
}

/**
 * Check if user has role
 */
export function hasRole(user: User | null, role: UserRole): boolean {
  if (!user) return false;
  return user.roles.includes(role);
}

/**
 * Check if user has any of the given roles
 */
export function hasAnyRole(user: User | null, roles: UserRole[]): boolean {
  if (!user) return false;
  return user.roles.some((role) => roles.includes(role));
}

/**
 * Check if user has all given roles
 */
export function hasAllRoles(user: User | null, roles: UserRole[]): boolean {
  if (!user) return false;
  return roles.every((role) => user.roles.includes(role));
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const db = getFirebaseDb();
    const q = query(collection(db, 'users'), where('email', '==', email));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) return null;
    
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    return {
      ...data,
      createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
    } as User;
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
}

/**
 * Add role to user
 */
export async function addRoleToUser(uid: string, role: UserRole): Promise<void> {
  const user = await getUserDocument(uid);
  if (!user) throw new Error('User not found');
  
  if (!user.roles.includes(role)) {
    user.roles.push(role);
    await updateUserDocument(uid, { roles: user.roles });
  }
}

/**
 * Remove role from user
 */
export async function removeRoleFromUser(uid: string, role: UserRole): Promise<void> {
  const user = await getUserDocument(uid);
  if (!user) throw new Error('User not found');
  
  user.roles = user.roles.filter((r) => r !== role);
  await updateUserDocument(uid, { roles: user.roles });
}

/**
 * Check if user is verified
 */
export function isUserVerified(user: User): boolean {
  return user.verification?.status === 'approved';
}

/**
 * Check if user is admin or super admin
 */
export function isUserAdmin(user: User): boolean {
  return user.roles.includes('admin') || user.roles.includes('super_admin');
}

/**
 * Check if user is moderator
 */
export function isUserModerator(user: User): boolean {
  return user.roles.includes('moderator') || isUserAdmin(user);
}
