'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface PrintContextType {
  isPrinting: boolean;
  setIsPrinting: (value: boolean) => void;
}

const PrintContext = createContext<PrintContextType | undefined>(undefined);

export function PrintProvider({ children }: { children: ReactNode }) {
  const [isPrinting, setIsPrinting] = useState(false);

  return (
    <React.Fragment>
      <PrintContext.Provider value={{ isPrinting, setIsPrinting }}>
        {children}
      </PrintContext.Provider>
    </React.Fragment>
  );
}

export function usePrint(): PrintContextType {
  const context = useContext(PrintContext);
  if (context === undefined) {
    // Fallback para evitar erros de runtime se o Provider não estiver no topo
    return {
      isPrinting: false,
      setIsPrinting: () => {},
    };
  }
  return context;
}
