import { ChargeMode, PriceSetting } from '@/types';

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getToleranceAdjustedMinutes(totalMinutes: number, toleranceMinutes: number) {
  if (totalMinutes <= 0) return 0;

  const safeTolerance = Math.max(0, Number(toleranceMinutes || 0));
  if (safeTolerance <= 0) return totalMinutes;

  const fullHours = Math.floor(totalMinutes / 60);
  const remainderMinutes = totalMinutes % 60;

  if (fullHours <= 0) return totalMinutes;
  if (remainderMinutes <= safeTolerance) return fullHours * 60;

  return fullHours * 60 + Math.max(0, remainderMinutes - safeTolerance);
}

function getIntegralAmount(
  totalMinutes: number,
  toleranceMinutes: number,
  valorHora: number,
  valorAdicional: number
) {
  if (totalMinutes <= 0) return 0;

  const safeTolerance = Math.max(0, Number(toleranceMinutes || 0));
  const firstHourValue = Math.max(0, Number(valorHora || 0));
  const additionalHourValue = Math.max(0, Number(valorAdicional || valorHora || 0));
  const halfAdditionalValue = additionalHourValue / 2;

  if (totalMinutes <= 60) return firstHourValue;

  const effectiveExtraMinutes = totalMinutes - 60 - safeTolerance;
  if (effectiveExtraMinutes <= 0) {
    return firstHourValue;
  }

  const additionalBlocks = Math.ceil(effectiveExtraMinutes / 60);
  return firstHourValue + additionalBlocks * halfAdditionalValue;
}

export function calculateParkingAmount(
  entryAt: string,
  priceSetting?: PriceSetting,
  chargeMode: ChargeMode = 'fracionado'
) {
  if (!priceSetting) {
    return { minutes: 0, total: 0, fractions: 0, fractionValue: 0, chargeMode };
  }

  const start = new Date(entryAt).getTime();
  const end = Date.now();
  const minutes = Math.max(0, Math.ceil((end - start) / 60000));

  const tolerancia = Number(priceSetting.tolerancia || 0);
  const valorHora = Number(priceSetting.valorHora || 0);
  const valorAdicional = Number(priceSetting.valorAdicional || 0);
  const diariaMaxima = Number(priceSetting.diariaMaxima || 0);
  const fractionValue = roundCurrency(valorHora / 4);

  const toleranceAdjustedMinutes = getToleranceAdjustedMinutes(minutes, tolerancia);
  const fractions = toleranceAdjustedMinutes > 0 ? Math.ceil(toleranceAdjustedMinutes / 15) : 0;
  let total = 0;

  if (chargeMode === 'integral') {
    total = getIntegralAmount(minutes, tolerancia, valorHora, valorAdicional);
  } else {
    total = fractions * fractionValue;
  }

  if (diariaMaxima > 0 && total > diariaMaxima) {
    total = diariaMaxima;
  }

  return {
    minutes,
    total: roundCurrency(total),
    fractions,
    fractionValue,
    chargeMode,
  };
}

export function diffDaysFromNow(date?: string) {
  if (!date) return 999;
  const end = new Date(date).setHours(0, 0, 0, 0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.floor((today - end) / 86400000);
}
