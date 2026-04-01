import { useEffect, useRef } from 'react';

export interface UsePrintOptions {
  autoPrint?: boolean;
  loaded: boolean;
  printMode?: string | null;
  returnTo?: string | null;
  onBeforePrint?: () => void;
}

/**
 * Hook para gerenciar o ciclo de vida de impressão no mobile e desktop.
 * 
 * PROBLEMA IDENTIFICADO (Android 14 - Samsung S23 FE):
 * - O preview abre mas fecha rapidamente
 * - Mostra tela de carregamento ou captura de tela
 * - A navegação de volta ocorre muito cedo, interrompendo o fluxo de impressão
 * 
 * SOLUÇÃO:
 * 1. Aumentar delay antes de chamar window.print() (800ms para 1200ms)
 * 2. Usar beforeprint em vez de afterprint como sinal primário
 * 3. Implementar timeout seguro de 2000ms para fallback
 * 4. Não tentar fechar a janela no Android (window.close() não funciona)
 * 5. Aguardar o evento 'focus' com delay maior (1000ms) antes de navegar
 */
export function usePrintLifecycle({
  autoPrint = true,
  loaded,
  printMode,
  returnTo,
  onBeforePrint
}: UsePrintOptions) {
  const startedRef = useRef(false);
  const blurredRef = useRef(false);
  const finishedRef = useRef(false);
  const beforePrintFiredRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!autoPrint || !loaded || finishedRef.current || startedRef.current) return;

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;

      // Limpar timeout se ainda estiver pendente
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (printMode === 'rawbt') {
        if (returnTo) window.location.replace(returnTo);
        else window.history.back();
        return;
      }

      // No Android, não tentamos window.close() pois não funciona em navegadores
      // Apenas navegamos de volta após garantir que o sistema de impressão assumiu o controle
      if (returnTo) {
        window.location.replace(returnTo);
      } else {
        window.history.back();
      }
    };

    // beforeprint é disparado ANTES do diálogo de impressão abrir
    // Isso nos permite saber que a página foi reconhecida como imprimível
    const handleBeforePrint = () => {
      beforePrintFiredRef.current = true;
    };

    // afterprint é disparado quando o usuário fecha o diálogo (imprime ou cancela)
    const handleAfterPrint = () => {
      finish();
    };

    const handleBlur = () => {
      blurredRef.current = true;
    };

    // No Android 14, o foco volta quando o diálogo de impressão fecha
    // Precisamos de um delay maior para garantir que o sistema assumiu o controle
    const handleFocus = () => {
      if (startedRef.current && blurredRef.current && beforePrintFiredRef.current) {
        // Delay de 1000ms para Android 14 processar o diálogo de impressão
        window.setTimeout(finish, 1000);
      }
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    // Disparar a impressão com delay seguro para garantir renderização completa
    // Android 14 precisa de mais tempo para preparar o preview
    const printTimer = window.setTimeout(() => {
      if (finishedRef.current) return;
      startedRef.current = true;
      if (onBeforePrint) onBeforePrint();
      
      // Chamar print
      window.print();

      // Fallback: se nenhum evento de impressão disparar em 2 segundos,
      // assumir que algo deu errado e navegar de volta
      timeoutRef.current = window.setTimeout(() => {
        if (!finishedRef.current) {
          console.warn('[SmartPark Print] Timeout: nenhum evento de impressão detectado');
          finish();
        }
      }, 2000);
    }, 1200);

    return () => {
      window.clearTimeout(printTimer);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [autoPrint, loaded, printMode, returnTo, onBeforePrint]);

  return { finished: finishedRef.current };
}
