/// <reference types="node" />
import 'server-only';

import { headers } from 'next/headers';

import {
  getAdminAccessToken,
  getDocumentByPath,
  mapFirestoreDocument,
} from '@/lib/support/firestore-rest';

type SupportUserProfile = {
  id: string;
  _name?: string;
  nome?: string;
  email?: string;
  role?: string;
  cargo?: string;
  tenantId?: string;
};

export type SupportAuthUser = {
  uid: string;
  email?: string;
  role: string;
  cargo: string;
  profile: SupportUserProfile;
};

function parseBearerToken(authorization?: string | null) {
  if (!authorization) return null;
  const [type, token] = authorization.split(' ');
  if (!type || !token) return null;
  if (type.toLowerCase() !== 'bearer') return null;
  return token.trim();
}

async function verifyFirebaseIdToken(idToken: string) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY não definida.');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store',
    }
  );

  const data = await response.json();

  if (!response.ok || !data?.users?.length) {
    return null;
  }

  const user = data.users[0];
  return {
    uid: user.localId as string,
    email: user.email as string | undefined,
  };
}

async function getUserProfile(uid: string): Promise<SupportUserProfile | null> {
  const accessToken = await getAdminAccessToken();
  const document = await getDocumentByPath(`users/${uid}`, accessToken);

  if (!document) return null;

  return mapFirestoreDocument(document) as SupportUserProfile;
}

export async function getSupportUserFromRequest(): Promise<SupportAuthUser | null> {
  const authorization = headers().get('authorization');
  const idToken = parseBearerToken(authorization);

  if (!idToken) return null;

  const authUser = await verifyFirebaseIdToken(idToken);
  if (!authUser?.uid) return null;

  const profile = await getUserProfile(authUser.uid);
  if (!profile) return null;

  const normalizedRole = String(profile.role ?? profile.cargo ?? '')
    .toLowerCase()
    .trim();

  if (normalizedRole !== 'suporte' && normalizedRole !== 'support') {
    return null;
  }

  return {
    uid: authUser.uid,
    email: authUser.email,
    role: String(profile.role ?? ''),
    cargo: String(profile.cargo ?? ''),
    profile,
  };
}