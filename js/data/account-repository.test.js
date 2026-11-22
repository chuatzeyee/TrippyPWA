// Deleting the signed-in user's account: the photos go first, then one database call, and any failure
// leaves the account alone.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ user: { id: 'user-1' }, calls: [], trips: null, list: null, remove: null, rpc: null, signOut: null, error: vi.fn() }));

vi.mock('../lib/logger.js', () => ({ logger: { error: h.error, warn: vi.fn(), info: vi.fn() } }));
vi.mock('../lib/supabase.js', () => ({
  getUser: () => h.user,
  supabase: {
    from: (table) => ({ select: (columns) => ({ eq: async (column, value) => { h.calls.push(['select', table, columns, column, value]); return h.trips(); } }) }),
    storage: {
      from: (bucket) => ({
        list: async (folder, opts) => { h.calls.push(['list', bucket, folder, opts.offset]); return h.list(folder, opts); },
        remove: async (paths) => { h.calls.push(['remove', bucket, paths]); return h.remove(paths); },
      }),
    },
    rpc: async (name, args) => { h.calls.push(['rpc', name, args]); return h.rpc(); },
    auth: { signOut: async (opts) => { h.calls.push(['signOut', opts]); return h.signOut(); } },
  },
}));

const { deleteMyAccount, signOutThisDevice } = await import('./account-repository.js');
const file = (name) => ({ name, id: `id-${name}` });

beforeEach(() => {
  h.user = { id: 'user-1' };
  h.calls = [];
  h.error.mockReset();
  h.trips = () => ({ data: [{ id: 't1' }, { id: 't2' }], error: null });
  h.list = (folder) => ({ data: folder === 't1' ? [file('act-a.jpg'), file('cover-v2-2400w-ab12.webp'), { name: 'sub', id: null }] : [], error: null });
  h.remove = () => ({ data: [], error: null });
  h.rpc = () => ({ data: true, error: null });
  h.signOut = () => ({ error: null });
});

describe('deleteMyAccount', () => {
  it('removes the stored photos of the trips the user owns, then calls delete_my_account once', async () => {
    expect(await deleteMyAccount()).toEqual({ error: null });
    expect(h.calls).toEqual([
      ['select', 'trips', 'id', 'user_id', 'user-1'],
      ['list', 'trip-photos', 't1', 0],
      ['remove', 'trip-photos', ['t1/act-a.jpg', 't1/cover-v2-2400w-ab12.webp']],
      ['list', 'trip-photos', 't2', 0],
      ['rpc', 'delete_my_account', undefined],
    ]);
  });
  it('reads a folder with more photos than one page to its end', async () => {
    h.trips = () => ({ data: [{ id: 't1' }], error: null });
    h.list = (_folder, { offset }) => ({ data: Array.from({ length: offset === 0 ? 100 : 3 }, (_, i) => file(`act-${offset + i}.jpg`)), error: null });
    await deleteMyAccount();
    const removed = h.calls.filter(([kind]) => kind === 'remove').flatMap(([, , paths]) => paths);
    expect(removed).toHaveLength(103);
    expect(removed.at(-1)).toBe('t1/act-102.jpg');
  });
  it('does not call the database when a photo cannot be removed, and says it failed', async () => {
    h.remove = () => ({ data: null, error: { message: 'denied' } });
    expect(await deleteMyAccount()).toEqual({ error: 'failed' });
    expect(h.calls.some(([kind]) => kind === 'rpc')).toBe(false);
    expect(h.error).toHaveBeenCalled();
  });
  it('does not call the database when the trips or a folder cannot be read', async () => {
    h.trips = () => ({ data: null, error: { message: 'offline' } });
    expect(await deleteMyAccount()).toEqual({ error: 'failed' });
    h.trips = () => ({ data: [{ id: 't1' }], error: null });
    h.list = () => ({ data: null, error: { message: 'offline' } });
    expect(await deleteMyAccount()).toEqual({ error: 'failed' });
    expect(h.calls.some(([kind]) => kind === 'rpc')).toBe(false);
  });
  it('names the refusal for the only admin', async () => {
    h.rpc = () => ({ data: null, error: { code: 'P0001', message: 'LAST_ADMIN' } });
    expect(await deleteMyAccount()).toEqual({ error: 'last-admin' });
  });
  it('reports any other database answer, and a thrown one, as failed', async () => {
    h.rpc = () => ({ data: null, error: { code: 'P0001', message: 'PHOTOS_REMAIN' } });
    expect(await deleteMyAccount()).toEqual({ error: 'failed' });
    h.rpc = () => { throw new Error('network'); };
    expect(await deleteMyAccount()).toEqual({ error: 'failed' });
  });
  it('does nothing without a session', async () => {
    h.user = null;
    expect(await deleteMyAccount()).toEqual({ error: 'not-signed-in' });
    expect(h.calls).toEqual([]);
  });
});

describe('signOutThisDevice', () => {
  it('ends the session on this device only, without a request for the deleted account', async () => {
    expect(await signOutThisDevice()).toBe(true);
    expect(h.calls).toEqual([['signOut', { scope: 'local' }]]);
  });
  it('answers false when the session could not be removed', async () => {
    h.signOut = () => { throw new Error('storage closed'); };
    expect(await signOutThisDevice()).toBe(false);
  });
});
