// Optimistic read-modify-write of one row, for the trips.extras writers in
// resolve-trip-photos (cover, photo credits and towns, the owner's daily
// budget). Plain .mjs (Deno and Node), no dependencies: `db` is a supabase-js
// client, or anything with the same from().select().eq().single() and
// from().update().eq().select() chain.
//
// trips.updated_at is bumped by a BEFORE UPDATE trigger on every write
// (001_initial_schema.sql), so it works as a row version: the update only
// lands if updated_at is what we read. If another write landed in between,
// the change is recomputed from a new read, so nothing the other writer
// stored (photoCredits, towns, cover) is overwritten.

export const ROW_WRITE_TRIES = 4;

/**
 * @param {object} db supabase-js client (service role)
 * @param {{ table: string, id: string, columns: string,
 *   change: (fresh: object) => object | null, tries?: number, log?: (msg: string, detail?: string) => void }} opts
 *   change: gets a fresh read of `columns` (plus updated_at) and returns the
 *   columns to write, or null to write nothing
 * @returns {Promise<{ written: boolean, row: object | null, raced: number }>} row: the read the
 *   written (or declined) change was computed from; raced: how many writes lost to another writer
 */
export async function updateRowVersioned(db, { table, id, columns, change, tries = ROW_WRITE_TRIES, log = () => {} }) {
  const select = `${columns}, updated_at`;
  for (let raced = 0; raced < tries; raced++) {
    const { data: fresh, error } = await db.from(table).select(select).eq("id", id).single();
    if (error || !fresh) return { written: false, row: null, raced };
    const patch = change(fresh);
    if (!patch) return { written: false, row: fresh, raced };
    const update = db.from(table).update(patch).eq("id", id);
    const guarded = fresh.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", fresh.updated_at);
    const { data: rows, error: writeError } = await guarded.select("id");
    if (writeError) {
      log(`${table} write failed`, writeError.message);
      return { written: false, row: fresh, raced };
    }
    if (rows?.length) return { written: true, row: fresh, raced };
  }
  log(`${table} write kept losing to other writes`, id);
  return { written: false, row: null, raced: tries };
}
