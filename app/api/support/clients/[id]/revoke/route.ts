import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Defina FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no Vercel.');
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
  const authHeader = request.headers.get('authorization');
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!idToken) return null;

  const app = getAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  const decoded = await auth.verifyIdToken(idToken);
  const userSnap = await db.collection('users').doc(decoded.uid).get();

  if (!userSnap.exists) return null;

  const profile = userSnap.data() || {};
  const role = String((profile as any).role ?? (profile as any).cargo ?? '')
    .toLowerCase()
    .trim();

  if (role !== 'suporte') return null;

  return { db };
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

    await supportUser.db.collection('client_tokens').doc(params.id).update({
      status: 'EXPIRADO',
      atualizadoEm: Timestamp.fromDate(new Date()),
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('PATCH /api/support/clients/[id]/revoke error:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao revogar token.' },
      { status: 500 }
    );
  }
}