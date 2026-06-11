/**
 * MedPulse Enterprise – Maintenance Service  v4.0
 */
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase";
import type { MaintenanceMode } from "@/types";

const functions = getFunctions();

export async function setMaintenance(options: {
  isActive: boolean;
  message?: string;
  isEmergencyLockdown?: boolean;
  scheduledEnd?: number;
}) {
  const fn = httpsCallable(functions, "setMaintenanceMode");
  return (await fn(options)).data;
}

export async function getMaintenanceStatus(): Promise<MaintenanceMode | null> {
  const db   = getFirebaseFirestore();
  const snap = await getDoc(doc(db, "maintenance", "config"));
  return snap.exists() ? (snap.data() as MaintenanceMode) : null;
}

/** Subscribe to live maintenance status changes */
export function subscribeToMaintenance(
  callback: (mode: MaintenanceMode | null) => void
): () => void {
  const db = getFirebaseFirestore();
  return onSnapshot(doc(db, "maintenance", "config"), (snap) => {
    callback(snap.exists() ? (snap.data() as MaintenanceMode) : null);
  });
}
