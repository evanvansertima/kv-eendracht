/**
 * Automatische aanwezigheid — spec §21.
 * Spiegel van de databaselogica (apply_match_result + finalize_round) voor
 * unit-tests en het controlescherm vóór afronden.
 */

export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'injured' | 'guest';

export interface AttendanceRecord {
  playerId: string;
  status: AttendanceStatus;
  source: 'auto' | 'manual';
}

/**
 * Registreert aanwezigheid voor alle spelers in een uitslag.
 * Een speler krijgt max. 1 telling per speelavond, ook bij meerdere partijen;
 * bestaande (ook handmatige) registraties worden nooit overschreven.
 */
export function markPresentForMatch(
  existing: ReadonlyMap<string, AttendanceRecord>,
  matchPlayerIds: readonly string[],
): Map<string, AttendanceRecord> {
  const out = new Map(existing);
  for (const id of matchPlayerIds) {
    if (!out.has(id)) {
      out.set(id, { playerId: id, status: 'present', source: 'auto' });
    }
  }
  return out;
}

/**
 * Afronden speelavond: alle verwachte deelnemers zonder registratie → absent.
 */
export function finalizeRoundAttendance(
  existing: ReadonlyMap<string, AttendanceRecord>,
  expectedPlayerIds: readonly string[],
): Map<string, AttendanceRecord> {
  const out = new Map(existing);
  for (const id of expectedPlayerIds) {
    if (!out.has(id)) {
      out.set(id, { playerId: id, status: 'absent', source: 'auto' });
    }
  }
  return out;
}

/** Heropenen: alleen automatisch gezette afwezigheid verdwijnt. */
export function reopenRoundAttendance(
  existing: ReadonlyMap<string, AttendanceRecord>,
): Map<string, AttendanceRecord> {
  const out = new Map<string, AttendanceRecord>();
  for (const [id, rec] of existing) {
    if (rec.status === 'absent' && rec.source === 'auto') continue;
    out.set(id, rec);
  }
  return out;
}

/** Controlescherm vóór afronden. */
export interface FinalizePreview {
  aanwezig: string[];
  nietVerwerkt: string[];
  afgemeld: string[];
  geblesseerd: string[];
  gast: string[];
}

export function buildFinalizePreview(
  existing: ReadonlyMap<string, AttendanceRecord>,
  expectedPlayerIds: readonly string[],
): FinalizePreview {
  const preview: FinalizePreview = { aanwezig: [], nietVerwerkt: [], afgemeld: [], geblesseerd: [], gast: [] };
  for (const id of expectedPlayerIds) {
    const rec = existing.get(id);
    if (!rec) preview.nietVerwerkt.push(id);
    else if (rec.status === 'present') preview.aanwezig.push(id);
    else if (rec.status === 'excused') preview.afgemeld.push(id);
    else if (rec.status === 'injured') preview.geblesseerd.push(id);
    else if (rec.status === 'guest') preview.gast.push(id);
    else preview.nietVerwerkt.push(id);
  }
  return preview;
}
