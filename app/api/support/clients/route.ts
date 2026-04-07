import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'crypto';
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

  return {
    uid: decoded.uid,
    profile,
    db,
  };
}

function normalizeStatus(data: any) {
  const raw = String(data?.status || 'PENDENTE').toUpperCase();

  if (raw === 'UTILIZADO') return 'UTILIZADO';
  if (raw === 'EXPIRADO') return 'EXPIRADO';

  const expiraEm = data?.expiraEm?.toDate?.() ?? (data?.expiraEm ? new Date(data.expiraEm) : null);

  if (expiraEm instanceof Date && !Number.isNaN(expiraEm.getTime()) && expiraEm.getTime() < Date.now()) {
    return 'EXPIRADO';
  }

  return 'PENDENTE';
}

export async function GET(request: Request) {
  try {
    const supportUser = await getAuthorizedSupportUser(request);

    if (!supportUser) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 });
    }

    const snap = await supportUser.db
      .collection('client_tokens')
      .orderBy('criadoEm', 'desc')
      .get();

    const items = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        status: normalizeStatus(data),
        criadoEm: data?.criadoEm?.toDate?.()?.toISOString?.() ?? null,
        expiraEm: data?.expiraEm?.toDate?.()?.toISOString?.() ?? null,
        utilizadoEm: data?.utilizadoEm?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error('GET /api/support/clients error:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao buscar clientes.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supportUser = await getAuthorizedSupportUser(request);

    if (!supportUser) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 });
    }

    const body = await request.json();
    const nome = String(body?.nome || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();

    if (!nome || !email) {
      return NextResponse.json(
        { error: 'Nome e e-mail são obrigatórios.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const expiraEm = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const tenantId = randomUUID();
    const token = randomBytes(16).toString('hex');

    const ref = await supportUser.db.collection('client_tokens').add({
      nome,
      email,
      tenantId,
      token,
      status: 'PENDENTE',
      criadoEm: Timestamp.fromDate(now),
      expiraEm: Timestamp.fromDate(expiraEm),
      utilizadoEm: null,
      criadoPor: supportUser.uid,
    });

    return NextResponse.json({
      item: {
        id: ref.id,
        nome,
        email,
        tenantId,
        token,
        status: 'PENDENTE',
        criadoEm: now.toISOString(),
        expiraEm: expiraEm.toISOString(),
        utilizadoEm: null,
      },
      token,
    });
  } catch (error: any) {
    console.error('POST /api/support/clients error:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao criar cliente.' },
      { status: 500 }
    );
  }
}