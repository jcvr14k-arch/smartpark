'use client';

import { getDoc } from 'firebase/firestore';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { tenantDoc } from '@/lib/tenant';
import { EstablishmentSettings, ParkingTicket } from '@/types';
import { shortDate, shortTime } from '@/utils/format';

const vehicleLabel = (type: ParkingTicket['vehicleType']) =>
  type === 'CAMINHAO'
    ? 'Caminhão'
    : type === 'CAMINHONETE'
      ? 'Caminhonete'
      : type === 'MOTO'
        ? 'Moto'
        : 'Carro';

export default function PrintEntradaPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenant');
  const printMode = searchParams.get('printMode');
  const autoPrint = searchParams.get('autoPrint') !== '0';
  const returnTo = searchParams.get('returnTo');
  const [ticket, setTicket] = useState<ParkingTicket | null>(null);
  const [settings, setSettings] = useState<EstablishmentSettings | null>(null);
  const [qr, setQr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const startedRef = useRef(false);
  const blurredRef = useRef(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    async function load() {
      const [ticketSnap, settingsSnap] = await Promise.all([
        getDoc(tenantDoc(db, tenantId, 'parkingTickets', params.id)),
        getDoc(tenantDoc(db, tenantId, 'settings', 'establishment')),
      ]);

      let nextTicket: ParkingTicket | null = null;
      let nextSettings: EstablishmentSettings | null = null;

      if (ticketSnap.exists()) {
        nextTicket = {
          id: ticketSnap.id,
          ...(ticketSnap.data() as Omit<ParkingTicket, 'id'>),
        };
        setTicket(nextTicket);
      }

      if (settingsSnap.exists()) {
        nextSettings = settingsSnap.data() as EstablishmentSettings;
        setSettings(nextSettings);
      }

      if (nextTicket) {
        const width = nextSettings?.printerWidth === '58mm' ? 160 : 220;
        const qrUrl = await QRCode.toDataURL(
          JSON.stringify({ ticketId: nextTicket.id, shortTicket: nextTicket.shortTicket, plate: nextTicket.plate || '' }),
          { width, margin: 1 }
        );
        setQr(qrUrl);
      }

      setLoaded(true);
    }

    load();
  }, [params.id, tenantId]);

  useEffect(() => {
    document.documentElement.classList.add('print-route-active');
    document.body.classList.add('print-route-active');
    return () => {
      document.documentElement.classList.remove('print-route-active');
      document.body.classList.remove('print-route-active');
    };
  }, []);

  useEffect(() => {
    if (!autoPrint || !loaded || !ticket || startedRef.current) return;

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      if (printMode === 'rawbt') {
        if (returnTo) window.location.replace(returnTo);
        else window.history.back();
        return;
      }
      window.close();
    };

    const handleAfterPrint = () => finish();
    const handleBlur = () => { blurredRef.current = true; };
    const handleFocus = () => {
      if (printMode === 'rawbt' && startedRef.current && blurredRef.current) window.setTimeout(finish, 250);
    };

    window.addEventListener('afterprint', handleAfterPrint);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    const raf1 = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          startedRef.current = true;
          window.print();
        }, 250);
      });
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      window.removeEventListener('afterprint', handleAfterPrint);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [autoPrint, loaded, printMode, returnTo, ticket]);

  const is58 = (settings?.printerWidth || '80mm') === '58mm';
  const styles = useMemo(() => ({
    pageWidth: is58 ? '58mm' : '80mm',
    padding: is58 ? '1.4mm 1.15mm 1.5mm' : '4mm 3.5mm 3mm',
    companyFont: is58 ? '3.45mm' : '5.6mm',
    companySub: is58 ? '1.85mm' : '2.9mm',
    metaFont: is58 ? '1.72mm' : '2.8mm',
    labelTop: is58 ? '2.2mm' : '3.8mm',
    codeFont: is58 ? '7.1mm' : '12mm',
    rowFont: is58 ? '2.32mm' : '4.3mm',
    footerFont: is58 ? '1.68mm' : '2.6mm',
    qrSize: is58 ? '20mm' : '31mm',
    cutHeight: is58 ? '6mm' : '14mm',
  }), [is58]);

  if (!ticket || !loaded) {
    return <><div className="print-ticket-page"><div className="print-ticket print-ticket-loading">Preparando cupom...</div></div><style>{basePrintStyles(styles, is58)}</style></>;
  }

  return (
    <>
      <div className="print-ticket-page">
        <div className="print-ticket">
          <div className="ticket-header">
            <div className="ticket-company">{settings?.name || 'SmartPark'}</div>
            {settings?.address ? <div className="ticket-company-sub">{settings.address}</div> : null}
            {settings?.phone || settings?.document ? <div className="ticket-company-meta">{settings?.phone ? <span>Tel: {settings.phone}</span> : null}{settings?.document ? <span>CNPJ: {settings.document}</span> : null}</div> : null}
          </div>
          <div className="ticket-dashed" />
          <div className="ticket-label-top">CÓDIGO DO TICKET</div>
          <div className="ticket-code">{ticket.shortTicket}</div>
          <div className="ticket-qr-wrap">{qr ? <img src={qr} alt="QR Code" className="ticket-qr" /> : null}</div>
          <div className="ticket-dashed" />
          <div className="ticket-row"><span className="ticket-row-label">Entrada:</span><span className="ticket-row-value">{shortDate(ticket.entryAt)}, {shortTime(ticket.entryAt)}</span></div>
          <div className="ticket-row"><span className="ticket-row-label">Veículo:</span><span className="ticket-row-value">{vehicleLabel(ticket.vehicleType)}</span></div>
          <div className="ticket-row"><span className="ticket-row-label">Placa:</span><span className="ticket-row-value">{ticket.plate || '-'}</span></div>
          <div className="ticket-row"><span className="ticket-row-label">Vaga:</span><span className="ticket-row-value">{ticket.parkingSpaceCode || '-'}</span></div>
          <div className="ticket-row"><span className="ticket-row-label">Operador:</span><span className="ticket-row-value">{ticket.entryOperatorName || ticket.cashierName || '-'}</span></div>
          <div className="ticket-dashed" />
          <div className="ticket-footer"><p>{settings?.ticketFooter || 'Nao nos responsabilizamos por objetos deixados no veiculo.'}</p><p>Perda do ticket: taxa adicional sera cobrada.</p></div>
          <div className="cut-space" />
        </div>
      </div>
      <style>{basePrintStyles(styles, is58)}</style>
    </>
  );
}

function basePrintStyles(styles: Record<string, string>, is58: boolean) { return `
  html.print-route-active, body.print-route-active { margin:0!important; padding:0!important; background:#fff!important; min-height:100%!important; height:auto!important; }
  .print-ticket-page { display:flex; justify-content:center; padding:0; margin:0; background:#fff; min-height:auto; }
  .print-ticket { width:${styles.pageWidth}; max-width:${styles.pageWidth}; background:#fff; color:#111827; padding:${styles.padding}; box-sizing:border-box; font-family:Arial,Helvetica,sans-serif; box-shadow:${is58 ? 'none' : '0 0 0 1px #e5e7eb, 0 8px 20px rgba(15, 23, 42, 0.08)'}; }
  .print-ticket-loading { text-align:center; padding-top:10mm; padding-bottom:10mm; }
  .ticket-header{text-align:center;margin-bottom:2.2mm;} .ticket-company{text-align:center;font-size:${styles.companyFont};font-weight:600;line-height:1.15;margin-bottom:1.2mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .ticket-company-sub{font-size:${styles.companySub};font-weight:500;line-height:1.25;color:#000;margin-bottom:0.8mm;} .ticket-company-meta{display:flex;justify-content:center;gap:2.2mm;flex-wrap:wrap;font-size:${styles.metaFont};line-height:1.2;color:#000;font-weight:500;} .ticket-dashed{border-top:0.35mm dashed #94a3b8;margin:3mm 0;} .ticket-label-top{text-align:center;font-size:${styles.labelTop};font-weight:700;letter-spacing:.2mm;margin-bottom:1.2mm;} .ticket-code{text-align:center;font-size:${styles.codeFont};font-weight:700;line-height:1;letter-spacing:${is58 ? '0.25mm' : '0.4mm'};margin-bottom:2mm;} .ticket-qr-wrap{display:flex;justify-content:center;margin:1mm 0 2mm;} .ticket-qr{width:${styles.qrSize};height:${styles.qrSize};image-rendering:pixelated;} .ticket-row{display:flex;justify-content:space-between;align-items:flex-start;gap:2mm;margin:1.2mm 0;font-size:${styles.rowFont};line-height:1.35;} .ticket-row-label{color:#000;font-weight:500;} .ticket-row-value{color:#111827;font-weight:600;text-align:right;} .ticket-footer{text-align:center;font-size:${styles.footerFont};line-height:1.2;color:#000;font-weight:500;margin-top:1.2mm;} .ticket-footer p{margin:0 0 .6mm;} .cut-space{height:${styles.cutHeight};}
  @page { size:auto; margin:0; }
  @media print { html,body{background:#fff!important;width:100%;} .print-ticket-page{display:block!important;min-height:0!important;} .print-ticket{margin:0 auto!important;box-shadow:none!important;break-inside:avoid;page-break-inside:avoid;} }
`; }
