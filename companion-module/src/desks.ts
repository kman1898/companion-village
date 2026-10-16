/*
 * Fair counting of mixing / lighting desk activity.
 *
 * Desk modules (X32, WING, Yamaha RCP, MagicQ, Generic OSC for grandMA3 …) update their variables
 * many times a second while an operator moves a fader. A Companion trigger watches those variables
 * and runs the "Desk activity" action on every change, and this class turns that stream into
 * operator actions:
 *
 *  - gesture:  changes to the same control count once until it has been still for `gapMs`
 *              (a whole fader move, a key press + release)
 *  - controls: every control the operator moves scores, also when several move at once
 *              (three faders pushed up together = 3)
 *  - recall:   more than `recallCount` controls starting within `togetherMs` is a scene / cue recall,
 *              which scores once, however many values it changes
 *  - repeat:   the same control scores at most once every `repeatMs` (no wiggling a fader for points)
 *  - cap:      at most `perMinute` actions per desk in any 60 seconds
 *
 * Gestures that start within `togetherMs` of each other are judged together once that window has passed,
 * so scores arrive a fraction of a second after the move.
 */

import type { TribeId } from './protocol.js'

export interface Fairness {
	gapMs: number
	togetherMs: number
	recallCount: number
	repeatMs: number
	perMinute: number
}

export type DeskResult = 'scored' | 'recall' | 'gesture' | 'pending' | 'repeat' | 'capped' | 'paused' | 'ignored'

interface ControlState {
	/** last change seen */
	last: number
	/** last time this control scored */
	scored: number
}

/** gestures that started close together, waiting to be judged */
interface Burst {
	start: number
	last: number
	keys: string[]
	recall: boolean
}

export interface DeskState {
	name: string
	tribe: TribeId
	values: Map<string, string> | null
	controls: Map<string, ControlState>
	burst: Burst | null
	/** times of the scores in the last minute */
	recent: number[]
	total: number
	lastControl: string
	lastResult: DeskResult | ''
}

const MAX_CONTROLS = 2000
/** values a variable has before the desk module knows it */
const NO_VALUE = new Set(['', '$NA', 'undefined', 'null', 'Not found'])

/** "label=value" items separated by new lines or |, as written by tools/desk-triggers.mjs */
export function parseDeskValues(raw: string): [string, string][] {
	const out: [string, string][] = []
	const items = raw.split(/\r?\n|\|/)
	for (let i = 0; i < items.length; i++) {
		const item = items[i].trim()
		if (!item) continue
		const eq = item.indexOf('=')
		if (eq > 0) out.push([item.slice(0, eq).trim(), item.slice(eq + 1).trim()])
		else out.push([`#${i + 1}`, item])
	}
	return out
}

export class DeskCounter {
	readonly desks = new Map<string, DeskState>()
	enabled = true
	scored = 0
	/** "desk · control" of the last score */
	last = ''
	/** "desk: result" of the last change */
	lastResult = ''

	constructor(
		private readonly fairness: () => Fairness,
		private readonly onScore: (desk: DeskState, control: string) => void,
	) {}

	#desk(name: string, tribe: TribeId): DeskState {
		let d = this.desks.get(name)
		if (!d) {
			d = {
				name,
				tribe,
				values: null,
				controls: new Map(),
				burst: null,
				recent: [],
				total: 0,
				lastControl: '',
				lastResult: '',
			}
			this.desks.set(name, d)
		}
		d.tribe = tribe
		return d
	}

	/**
	 * Values mode: the trigger passes the current value of every watched control.
	 * Controls whose value changed since the last call are touched; the first call only learns the values.
	 */
	observe(name: string, tribe: TribeId, raw: string, ignore: RegExp | null, now = Date.now()): DeskResult[] {
		const d = this.#desk(name, tribe)
		this.#flushDesk(d, now)
		const items = parseDeskValues(raw)
		const first = d.values === null
		const values = d.values ?? new Map<string, string>()
		d.values = values
		const results: DeskResult[] = []
		for (const [key, value] of items) {
			const before = values.get(key)
			values.set(key, value)
			if (first || before === value) continue
			// a desk module (re)loading its state is not an operator action
			if (before === undefined || NO_VALUE.has(before) || NO_VALUE.has(value)) continue
			results.push(this.#touch(d, key, ignore, now))
		}
		return results
	}

	/** Event mode: something happened on this control (an OSC message, a key press …) */
	touch(name: string, tribe: TribeId, control: string, ignore: RegExp | null, now = Date.now()): DeskResult {
		const d = this.#desk(name, tribe)
		this.#flushDesk(d, now)
		return this.#touch(d, control || name, ignore, now)
	}

	/** Judge the gestures whose window has passed; call this a few times a second */
	flush(now = Date.now()): boolean {
		let judged = false
		for (const d of this.desks.values()) judged = this.#flushDesk(d, now) || judged
		return judged
	}

	#touch(d: DeskState, key: string, ignore: RegExp | null, now: number): DeskResult {
		if (ignore?.test(key)) return 'ignored'
		const f = this.fairness()
		let c = d.controls.get(key)
		if (c && now - c.last < f.gapMs) {
			c.last = now
			return 'gesture'
		}
		if (!c) {
			if (d.controls.size >= MAX_CONTROLS) this.#prune(d, now)
			c = { last: now, scored: -Infinity }
			d.controls.set(key, c)
		}
		c.last = now
		// a new gesture starts here: it joins the open burst, or opens one
		const b = d.burst
		if (b && (now - b.start <= f.togetherMs || (b.recall && now - b.last <= f.togetherMs))) {
			b.keys.push(key)
			b.last = now
			if (!b.recall && f.recallCount > 0 && b.keys.length > f.recallCount) b.recall = true
		} else {
			if (b) this.#judge(d, b, now)
			d.burst = { start: now, last: now, keys: [key], recall: false }
		}
		return 'pending'
	}

	#flushDesk(d: DeskState, now: number): boolean {
		const b = d.burst
		if (!b) return false
		const f = this.fairness()
		// a recall stays open while its values keep trickling in
		if (now - b.start <= f.togetherMs || (b.recall && now - b.last <= f.togetherMs)) return false
		d.burst = null
		this.#judge(d, b, now)
		return true
	}

	#judge(d: DeskState, b: Burst, now: number) {
		if (b.recall) this.#result(d, this.#score(d, b.keys[0], now, true))
		else for (const key of b.keys) this.#result(d, this.#score(d, key, now, false))
	}

	#result(d: DeskState, r: DeskResult) {
		d.lastResult = r
		this.lastResult = `${d.name}: ${r}`
	}

	#score(d: DeskState, key: string, now: number, recall: boolean): DeskResult {
		const f = this.fairness()
		if (!this.enabled) return 'paused'
		const c = d.controls.get(key)
		if (!recall && c && now - c.scored < f.repeatMs) return 'repeat'
		while (d.recent.length && now - d.recent[0] >= 60_000) d.recent.shift()
		if (f.perMinute > 0 && d.recent.length >= f.perMinute) return 'capped'
		if (c) c.scored = now
		d.recent.push(now)
		d.total++
		const label = recall ? 'scene recall' : key
		d.lastControl = label
		this.scored++
		this.last = `${d.name} · ${label}`
		this.onScore(d, label)
		return recall ? 'recall' : 'scored'
	}

	#prune(d: DeskState, now: number) {
		for (const [k, c] of d.controls) if (now - c.last > 60_000) d.controls.delete(k)
		if (d.controls.size >= MAX_CONTROLS) d.controls.clear()
	}

	/** Forget scores and learned values (not the scores already sent to the village) */
	reset(): void {
		this.desks.clear()
		this.scored = 0
		this.last = ''
		this.lastResult = ''
	}

	totalFor(tribe: TribeId): number {
		let n = 0
		for (const d of this.desks.values()) if (d.tribe === tribe) n += d.total
		return n
	}
}

/** A user-supplied ignore pattern; invalid patterns are treated as plain text */
export function ignorePattern(src: string): RegExp | null {
	const s = src.trim()
	if (!s) return null
	try {
		return new RegExp(s, 'i')
	} catch {
		return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
	}
}
