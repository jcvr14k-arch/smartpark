import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'crypto';
import { doc, getDoc, getDocs, collection, addDoc, query, where, orderBy, updateDoc, Timestamp } from 'firebase/firestore';

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

function normalizeStatus(item: any) {
  const status = String(item?.status || 'PENDENTE').toUpperCase();
  if (status === 'UTILIZADO') return 'UTILIZADO';
  if (status === 'EXPIRADO') return 'EXPIRADO';

  const expiresAt = item?.expiraEm?.toDate ? item.expiraEm.toDate() : new Date(item?.expiraEm || 0);
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
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

    const constraints: any[] = [orderBy('criadoEm', 'desc')];
    if (supportUser.profile?.tenantId) {
      constraints.unshift(where('tenantId', '==', supportUser.profile.tenantId));
    }

    const snap = await getDocs(query(collection(db, 'client_tokens'), ...constraints));

    const items = snap.docs.map((item) => {
      const data = item.data() as any;
      return {
        id: item.id,
        ...data,
        criadoEm: data?.criadoEm?.toDate ? data.criadoEm.toDate().toISOString() : null,
        expiraEm: data?.expiraEm?.toDate ? data.expiraEm.toDate().toISOString() : null,
        utilizadoEm: data?.utilizadoEm?.toDate ? data.utilizadoEm.toDate().toISOString() : null,
        status: normalizeStatus(data),
      };
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error('GET /api/support/clients', error);
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
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const tenantId = randomUUID();
    const token = randomBytes(16).toString('hex');

    const docRef = await addDoc(collection(db, 'client_tokens'), {
      nome,
      email,
      tenantId,
      token,
      status: 'PENDENTE',
      criadoEm: Timestamp.fromDate(now),
      expiraEm: Timestamp.fromDate(expiresAt),
      utilizadoEm: null,
      criadoPor: supportUser.uid,
      tenantOwnerId: supportUser.profile?.tenantId || null,
    });

    return NextResponse.json({
      item: {
        id: docRef.id,
        nome,
        email,
        tenantId,
        token,
        status: 'PENDENTE',
        criadoEm: now.toISOString(),
        expiraEm: expiresAt.toISOString(),
        utilizadoEm: null,
      },
      token,
    });
  } catch (error: any) {
    console.error('POST /api/support/clients', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao criar cliente.' },
      { status: 500 }
    );
  }
}