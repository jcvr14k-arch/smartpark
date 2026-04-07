function onlyAsciiUpper(value: string, max: number) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, max);
}

function emvField(id: string, value: string) {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildPixPayload({
  key,
  receiverName,
  city,
  amount,
  txid,
}: {
  key: string;
  receiverName?: string;
  city?: string;
  amount?: number;
  txid?: string;
}) {
  const normalizedKey = key.trim();
  const merchantName = onlyAsciiUpper(receiverName || 'SMARTPARK', 25) || 'SMARTPARK';
  const merchantCity = onlyAsciiUpper(city || 'BRASIL', 15) || 'BRASIL';
  const reference = onlyAsciiUpper(txid || 'SMARTPARK', 25) || 'SMARTPARK';

  const merchantAccountInfo = [
    emvField('00', 'br.gov.bcb.pix'),
    emvField('01', normalizedKey),
  ].join('');

  const amountValue = typeof amount === 'number' && Number.isFinite(amount) && amount > 0
    ? Number(amount).toFixed(2)
    : '';

  const payload = [
    emvField('00', '01'),
    emvField('01', '12'),
    emvField('26', merchantAccountInfo),
    emvField('52', '0000'),
    emvField('53', '986'),
    amountValue ? emvField('54', amountValue) : '',
    emvField('58', 'BR'),
    emvField('59', merchantName),
    emvField('60', merchantCity),
    emvField('62', emvField('05', reference)),
    '6304',
  ].join('');

  return `${payload}${crc16(payload)}`;
}
