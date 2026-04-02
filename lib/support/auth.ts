/// <reference types="node" />
import 'server-only';

import { getDocument } from '@/lib/support/firestore-rest';

type FirebaseLookupResponse = {
  users?: Array<{
    localId?: string;
    email?: string;
  }>;
};

function getApiKey() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY não definido.');
  }
  return apiKey;
}

export async function verifySupportAccess(request: Request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${getApiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store',
    }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as FirebaseLookupResponse;
  const uid = data.users?.[0]?.localId;
  if (!uid) return null;

  const profile = await getDocument('users', uid).catch(() => null);
  if (!profile) return null;

  const normalizedRole = String((profile.role ?? profile.cargo ?? '')).toLowerCase().trim();
  if (normalizedRole !== 'suporte' && normalizedRole !== 'support') return null;

  return {
    uid,
    email: data.users?.[0]?.email || profile.email || '',
    profile,
  };
}
