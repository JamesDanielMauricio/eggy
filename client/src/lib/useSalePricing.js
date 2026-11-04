import { useState } from 'react';
import { salePrices, saleTotal } from './salePricing';

export function useSalePricing(quantity, sale) {
  const [source, setSource] = useState(() => sale
    ? { basis: 'existing', amount: saleTotal(sale).toFixed(2), quantity: sale.quantity }
    : { basis: 'perEgg', amount: '' });

  return {
    ...salePrices(source, quantity),
    changePerEgg: (amount) => setSource({ basis: 'perEgg', amount }),
    changePerTray: (amount) => setSource({ basis: 'perTray', amount }),
    changeTotal: (amount) => setSource({ basis: 'total', amount }),
    reset: () => setSource({ basis: 'perEgg', amount: '' }),
  };
}
