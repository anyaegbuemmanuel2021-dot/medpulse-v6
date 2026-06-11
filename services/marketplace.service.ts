/**
 * MedPulse Enterprise – Marketplace Service  v6.0
 */
import {
  collection, query, where, orderBy, limit,
  getDocs, addDoc, doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { getFirebaseFirestore as db } from "@/lib/firebase";
import type { MarketplaceListing, SellerReview } from "@/types";

export async function getListings(category?: string, limitN = 24): Promise<MarketplaceListing[]> {
  let q = query(collection(db(), "marketplace_listings"),
    where("status", "==", "active"),
    orderBy("createdAt", "desc"),
    limit(limitN)
  );
  if (category) {
    q = query(collection(db(), "marketplace_listings"),
      where("status", "==", "active"),
      where("category", "==", category),
      orderBy("createdAt", "desc"),
      limit(limitN)
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MarketplaceListing));
}

export async function createListing(
  listing: Omit<MarketplaceListing, "id" | "status" | "viewCount" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db(), "marketplace_listings"), {
    ...listing,
    status: "pending_review",
    viewCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getSellerListings(sellerId: string): Promise<MarketplaceListing[]> {
  const snap = await getDocs(
    query(collection(db(), "marketplace_listings"),
      where("sellerId", "==", sellerId),
      orderBy("createdAt", "desc"),
      limit(50)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MarketplaceListing));
}
