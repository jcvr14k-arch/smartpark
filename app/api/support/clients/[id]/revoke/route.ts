import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { auth as adminAuth } from 'firebase-admin';
import { getApps, initializeApp, cert } from 'firebase-admin/app';

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Variáveis FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY não definidas.');
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

async function getAuthorizedSupportUser(request: Request) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) return null;

  getAdminApp();
  const decoded = await adminAuth().verifyIdToken(token);
  const userDoc = await getDoc(doc(db, 'users', decoded.uid));

  if (!userDoc.exists()) return null;

  const profile = userDoc.data() as any;
  const role = String(profile?.role ?? profile?.cargo ?? '').toLowerCase().trim();

  if (role !== 'suporte') return null;

  return {
    uid: decoded.uid,
    profile,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supportUser = await getAuthorizedSupportUser(request);

    if (!supportUser) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 });
    }

    const targetRef = doc(db, 'client_tokens', params.id);
    await updateDoc(targetRef, {
      status: 'EXPIRADO',
      atualizadoEm: Timestamp.fromDate(new Date()),
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('PATCH /api/support/clients/[id]/revoke', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao revogar token.' },
      { status: 500 }
    );
  }
}