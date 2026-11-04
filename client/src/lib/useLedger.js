import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';

const COLLECTIONS = ['sales', 'expenses', 'harvests'];
const REFRESH_INTERVAL = 30_000;

export function useLedger() {
  const [ledger, setLedger] = useState({ sales: [], expenses: [], harvests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState('idle');
  const mounted = useRef(false);
  const inFlight = useRef(null);
  const lastLoaded = useRef(0);
  const revisions = useRef({ sales: 0, expenses: 0, harvests: 0 });
  const writes = useRef(new Set());

  const load = useCallback(({ background = false, force = false } = {}) => {
    if (inFlight.current) return inFlight.current.promise;
    if (background && !force && Date.now() - lastLoaded.current < REFRESH_INTERVAL) return;

    const controller = new AbortController();
    const startingRevisions = { ...revisions.current };
    const pendingAtStart = new Set([...writes.current].map((key) => key.split(':')[0]));
    setError('');
    const markSync = (status) => {
      if (mounted.current && !controller.signal.aborted) setSyncStatus(status);
    };
    const syncingTimer = background ? setTimeout(() => markSync('syncing'), 500) : null;
    const slowTimer = background ? setTimeout(() => markSync('slow'), 3000) : null;

    const promise = api.getLedger({ signal: controller.signal })
      .then((fresh) => {
        if (!mounted.current || controller.signal.aborted) return;
        // A refresh started before an edit must never restore the old row,
        // or make a successfully deleted entry reappear.
        const unchanged = COLLECTIONS.filter((collection) => (
          !pendingAtStart.has(collection) && startingRevisions[collection] === revisions.current[collection]
        ));
        setLedger((previous) => ({
          ...previous,
          ...Object.fromEntries(unchanged.map((collection) => [collection, fresh[collection]])),
        }));
        if (unchanged.length === COLLECTIONS.length) lastLoaded.current = Date.now();
      })
      .catch((err) => {
        if (mounted.current && !controller.signal.aborted) {
          setError(api.errorMessage(err, 'Could not load your records. Please retry.'));
        }
      })
      .finally(() => {
        clearTimeout(syncingTimer);
        clearTimeout(slowTimer);
        if (inFlight.current?.controller === controller) inFlight.current = null;
        if (mounted.current && !controller.signal.aborted) {
          setLoading(false);
          setSyncStatus('idle');
        }
      });
    inFlight.current = { controller, promise };
    return promise;
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const resume = () => {
      if (document.visibilityState === 'visible') load({ background: true });
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      mounted.current = false;
      inFlight.current?.controller.abort();
      inFlight.current = null;
      document.removeEventListener('visibilitychange', resume);
    };
  }, [load]);

  const mutate = useCallback(async (collection, id, request, apply) => {
    const key = `${collection}:${id}`;
    if (writes.current.has(key)) throw new Error('This entry is already being saved.');
    writes.current.add(key);
    revisions.current[collection] += 1;
    try {
      const saved = await request();
      if (mounted.current) {
        setLedger((previous) => ({ ...previous, [collection]: apply(previous[collection], saved) }));
      }
      return saved;
    } finally {
      writes.current.delete(key);
      revisions.current[collection] += 1;
    }
  }, []);

  const actions = useMemo(() => {
    const add = (collection, request) => (entry) => mutate(
      collection, 'new', () => request(entry), (rows, saved) => [...rows, saved],
    );
    const update = (collection, request) => (id, fields) => mutate(
      collection, id, () => request(id, fields), (rows, saved) => rows.map((row) => row.id === id ? saved : row),
    );
    const remove = (collection, request) => (id) => mutate(
      collection, id, () => request(id), (rows) => rows.filter((row) => row.id !== id),
    );
    return {
      addSale: add('sales', api.createSale),
      updateSale: update('sales', api.updateSale),
      updateSaleStatus: update('sales', api.updateSaleStatus),
      deleteSale: remove('sales', api.deleteSale),
      addExpense: add('expenses', api.createExpense),
      updateExpense: update('expenses', api.updateExpense),
      deleteExpense: remove('expenses', api.deleteExpense),
      addHarvest: add('harvests', api.createHarvest),
      deleteHarvest: remove('harvests', api.deleteHarvest),
    };
  }, [mutate]);

  return {
    ...ledger, ...actions, loading, error, syncStatus,
    clearError: () => setError(''),
    retry: () => load({ background: true, force: true }),
  };
}
