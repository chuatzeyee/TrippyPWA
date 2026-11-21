// The key-by-key merge between a device and the server (blueprint 5.2), what is written back, and the
// two-device interleavings of blueprint 9.1.
import { describe, it, expect } from 'vitest';
import {
  emptyEnvelope, envelopeForServer, mergeEnvelopes, migrateLegacy, normalisePrefs, sameEnvelope, stampPatch,
} from './prefs.js';

const SUN = '2026-11-15T09:00:00.000Z';
const MON = '2026-11-16T09:00:00.000Z';
const TUE = '2026-11-17T09:00:00.000Z';
const env = (values = {}, at = {}, v = 1) => ({ v, values, at });
const frozen = (value) => {
  if (value && typeof value === 'object') Object.values(value).forEach(frozen);
  return Object.freeze(value);
};

describe('mergeEnvelopes, one row of the table each', () => {
  it('stamped and stamped: the later timestamp wins', () => {
    expect(mergeEnvelopes(env({ view: 'atlas' }, { view: MON }), env({ view: 'departures' }, { view: TUE })))
      .toEqual(env({ view: 'departures' }, { view: TUE }));
    expect(mergeEnvelopes(env({ view: 'atlas' }, { view: TUE }), env({ view: 'departures' }, { view: MON })))
      .toEqual(env({ view: 'atlas' }, { view: TUE }));
  });
  it('stamped and stamped: a tie keeps local', () => {
    expect(mergeEnvelopes(env({ view: 'atlas' }, { view: MON }), env({ view: 'departures' }, { view: MON })))
      .toEqual(env({ view: 'atlas' }, { view: MON }));
  });
  it('compares times, not text, so two spellings of one moment tie', () => {
    const local = env({ view: 'atlas' }, { view: '2026-11-16T17:00:00.000+08:00' });
    expect(mergeEnvelopes(local, env({ view: 'departures' }, { view: MON })).values.view).toBe('atlas');
  });
  it('stamped and unstamped: local', () => {
    expect(mergeEnvelopes(env({ theme: 'dark' }, { theme: SUN }), env({ theme: 'light' })))
      .toEqual(env({ theme: 'dark' }, { theme: SUN }));
  });
  it('stamped and absent: local', () => {
    expect(mergeEnvelopes(env({ theme: 'dark' }, { theme: SUN }), emptyEnvelope()))
      .toEqual(env({ theme: 'dark' }, { theme: SUN }));
  });
  it('unstamped and stamped: server', () => {
    expect(mergeEnvelopes(env({ theme: 'dark' }), env({ theme: 'light' }, { theme: SUN })))
      .toEqual(env({ theme: 'light' }, { theme: SUN }));
  });
  it('absent and stamped: server', () => {
    expect(mergeEnvelopes(emptyEnvelope(), env({ timeFormat: '24h' }, { timeFormat: SUN })))
      .toEqual(env({ timeFormat: '24h' }, { timeFormat: SUN }));
  });
  it('unstamped and unstamped: local, each device keeps its own', () => {
    expect(mergeEnvelopes(env({ theme: 'dark' }), env({ theme: 'light' }))).toEqual(env({ theme: 'dark' }));
  });
  it('absent and unstamped: the device takes nothing, an unstamped value is nobody\'s choice', () => {
    expect(mergeEnvelopes(emptyEnvelope(), env({ theme: 'light', mapStyle: 'paper' }))).toEqual(emptyEnvelope());
  });
  it('viewChooserSeen is true if either side is true, whatever the timestamps', () => {
    const seenOld = env({ viewChooserSeen: true }, { viewChooserSeen: SUN });
    const unseenNew = env({ viewChooserSeen: false }, { viewChooserSeen: TUE });
    expect(mergeEnvelopes(seenOld, unseenNew).values.viewChooserSeen).toBe(true);
    expect(mergeEnvelopes(unseenNew, seenOld).values.viewChooserSeen).toBe(true);
    expect(mergeEnvelopes(env({ viewChooserSeen: true }), emptyEnvelope()).values.viewChooserSeen).toBe(true);
    expect(mergeEnvelopes(emptyEnvelope(), env({ viewChooserSeen: true })).values.viewChooserSeen).toBe(true);
    expect(mergeEnvelopes(env({ viewChooserSeen: false }), env({ viewChooserSeen: false })).values.viewChooserSeen).toBe(false);
  });
  it('viewChooserSeen never changes another key', () => {
    const local = env({ view: 'atlas', viewChooserSeen: true }, { viewChooserSeen: TUE });
    const remote = env({ view: 'departures' }, { view: MON });
    expect(mergeEnvelopes(local, remote)).toEqual(env({ view: 'departures', viewChooserSeen: true }, { view: MON, viewChooserSeen: TUE }));
  });
  it('when both sides have seen the chooser the server timestamp stays, so no device writes for it', () => {
    const local = env({ viewChooserSeen: true }, { viewChooserSeen: TUE });
    const remote = env({ viewChooserSeen: true }, { viewChooserSeen: SUN });
    const merged = mergeEnvelopes(local, remote);
    expect(merged.at.viewChooserSeen).toBe(SUN);
    expect(sameEnvelope(envelopeForServer(merged, remote), remote)).toBe(true);
  });
  it('unknown keys are kept on both sides and merge by the same rule', () => {
    const local = env({ mapStyle: 'paper', units: 'metric' }, { mapStyle: MON, units: SUN });
    const remote = env({ mapStyle: 'ink', density: 'cosy', units: 'imperial' }, { mapStyle: SUN, density: TUE, units: TUE });
    expect(mergeEnvelopes(local, remote)).toEqual(env(
      { mapStyle: 'paper', units: 'imperial', density: 'cosy' },
      { mapStyle: MON, units: TUE, density: TUE },
    ));
  });
  it('takes the higher version and changes neither input', () => {
    const local = frozen(env({ view: 'atlas' }, { view: MON }));
    const remote = frozen(env({ view: 'departures' }, { view: TUE }, 2));
    expect(mergeEnvelopes(local, remote).v).toBe(2);
    expect(local.values.view).toBe('atlas');
  });
  it('reads a broken side as empty', () => {
    const local = env({ view: 'concierge' }, { view: MON });
    expect(mergeEnvelopes(local, null)).toEqual(local);
    expect(mergeEnvelopes('junk', local)).toEqual(local);
    expect(mergeEnvelopes(undefined, {})).toEqual(emptyEnvelope());
  });
});

describe('envelopeForServer', () => {
  it('adds the stamped keys to what the server has', () => {
    const remote = env({ view: 'departures' }, { view: MON });
    const merged = mergeEnvelopes(env({ timeFormat: '24h' }, { timeFormat: TUE }), remote);
    expect(envelopeForServer(merged, remote)).toEqual(env({ view: 'departures', timeFormat: '24h' }, { view: MON, timeFormat: TUE }));
  });
  it('never sends an unstamped value and never removes one the server holds', () => {
    const remote = env({ theme: 'light', mapStyle: 'paper' });
    const merged = mergeEnvelopes(env({ theme: 'dark', motion: 'reduce' }), remote);
    expect(envelopeForServer(merged, remote)).toEqual(remote);
  });
  it('sends a seen chooser even when it carries no timestamp', () => {
    expect(envelopeForServer(env({ viewChooserSeen: true }), emptyEnvelope())).toEqual(env({ viewChooserSeen: true }));
  });
  it('is the version this build writes and reads {} as empty', () => {
    expect(envelopeForServer(env({ view: 'atlas' }, { view: MON }), {})).toEqual(env({ view: 'atlas' }, { view: MON }));
    expect(sameEnvelope(envelopeForServer(emptyEnvelope(), {}), {})).toBe(true);
  });
});

describe('sameEnvelope', () => {
  it('ignores key order and compares nested unknown values', () => {
    expect(sameEnvelope(env({ a: 1, b: { x: 1, y: [1, 2] } }, { a: MON }), env({ b: { y: [1, 2], x: 1 }, a: 1 }, { a: MON }))).toBe(true);
    expect(sameEnvelope(env({ b: { y: [1, 2] } }), env({ b: { y: [2, 1] } }))).toBe(false);
  });
  it('sees a changed value, timestamp or version', () => {
    const base = env({ view: 'atlas' }, { view: MON });
    expect(sameEnvelope(base, env({ view: 'atlas' }, { view: MON }))).toBe(true);
    expect(sameEnvelope(base, env({ view: 'departures' }, { view: MON }))).toBe(false);
    expect(sameEnvelope(base, env({ view: 'atlas' }, { view: TUE }))).toBe(false);
    expect(sameEnvelope(base, env({ view: 'atlas' }, { view: MON }, 2))).toBe(false);
    expect(sameEnvelope(base, env({ view: 'atlas' }))).toBe(false);
  });
});

describe('two devices (blueprint 9.1)', () => {
  /** One sync of a device against the server: read, merge, write. Returns the new device copy and server copy. */
  const sync = (device, server) => {
    const merged = mergeEnvelopes(device, server);
    return { device: merged, server: envelopeForServer(merged, server) };
  };

  it('(a) Departures picked on the desktop on Monday survives a phone open since Sunday that toggles 24-hour on Tuesday', () => {
    let server = emptyEnvelope();
    let desktop = emptyEnvelope();
    let phone = emptyEnvelope(); // open since Sunday: it has never heard of the Monday choice

    desktop = stampPatch(desktop, { view: 'departures' }, MON);
    ({ device: desktop, server } = sync(desktop, server));

    phone = stampPatch(phone, { timeFormat: '24h' }, TUE);
    ({ device: phone, server } = sync(phone, server));
    ({ device: desktop, server } = sync(desktop, server));

    for (const copy of [phone, desktop, server]) {
      expect(normalisePrefs(copy.values)).toMatchObject({ view: 'departures', timeFormat: '24h' });
    }
    expect(server.at).toEqual({ view: MON, timeFormat: TUE });
  });

  it('(a) also when the phone holds an older choice of its own', () => {
    let server = env({ view: 'departures' }, { view: MON });
    let phone = env({ view: 'concierge' }, { view: SUN });
    phone = stampPatch(phone, { timeFormat: '24h' }, TUE);
    ({ device: phone, server } = sync(phone, server));
    expect(normalisePrefs(server.values)).toMatchObject({ view: 'departures', timeFormat: '24h' });
    expect(normalisePrefs(phone.values)).toMatchObject({ view: 'departures', timeFormat: '24h' });
  });

  it('(b) Departures picked on A at T1 survives B only dismissing the chooser at T2', () => {
    let server = emptyEnvelope();
    let a = stampPatch(emptyEnvelope(), { view: 'departures' }, MON);
    ({ device: a, server } = sync(a, server));

    let b = stampPatch(emptyEnvelope(), { viewChooserSeen: true }, TUE); // "Keep Atlas": stamps nothing else
    expect(b.at.view).toBeUndefined();
    ({ device: b, server } = sync(b, server));
    ({ device: a, server } = sync(a, server));

    for (const copy of [a, b, server]) {
      expect(normalisePrefs(copy.values)).toMatchObject({ view: 'departures', viewChooserSeen: true });
    }
  });

  it('(b) in the weeks before the column exists: both devices are local only, then both sync', () => {
    const a = stampPatch(emptyEnvelope(), { view: 'departures' }, MON);
    const b = stampPatch(emptyEnvelope(), { viewChooserSeen: true }, TUE);
    let server = emptyEnvelope();
    let bNow;
    ({ device: bNow, server } = sync(b, server)); // B is first to reach the new column
    const { device: aNow, server: end } = sync(a, server);
    const { device: bEnd } = sync(bNow, end);
    for (const copy of [aNow, bEnd, end]) {
      expect(normalisePrefs(copy.values)).toMatchObject({ view: 'departures', viewChooserSeen: true });
    }
  });

  it('(c) two legacy themes on two devices stay as they are, and nothing is written for them', () => {
    let server = emptyEnvelope();
    let a = migrateLegacy({ theme: 'light' });
    let b = migrateLegacy({ theme: 'dark' });
    for (let round = 0; round < 3; round += 1) {
      const afterA = sync(a, server);
      expect(sameEnvelope(afterA.server, server)).toBe(true);
      ({ device: a, server } = afterA);
      const afterB = sync(b, server);
      expect(sameEnvelope(afterB.server, server)).toBe(true);
      ({ device: b, server } = afterB);
    }
    expect(normalisePrefs(a.values).theme).toBe('light');
    expect(normalisePrefs(b.values).theme).toBe('dark');
    expect(server).toEqual(emptyEnvelope());
  });

  it('(c) an explicit theme on one device then reaches the other', () => {
    let server = emptyEnvelope();
    let a = stampPatch(migrateLegacy({ theme: 'light' }), { theme: 'dark' }, MON);
    let b = migrateLegacy({ theme: 'light' });
    ({ device: a, server } = sync(a, server));
    ({ device: b, server } = sync(b, server));
    expect(normalisePrefs(b.values).theme).toBe('dark');
  });

  it('a settled pair of devices writes nothing more', () => {
    let server = emptyEnvelope();
    let a = stampPatch(emptyEnvelope(), { view: 'concierge', viewChooserSeen: true }, MON);
    let b = stampPatch(emptyEnvelope(), { viewChooserSeen: true, temperatureUnit: 'F' }, TUE);
    ({ device: a, server } = sync(a, server));
    ({ device: b, server } = sync(b, server));
    ({ device: a, server } = sync(a, server));
    const settled = server;
    expect(sameEnvelope(sync(a, settled).server, settled)).toBe(true);
    expect(sameEnvelope(sync(b, settled).server, settled)).toBe(true);
  });
});
