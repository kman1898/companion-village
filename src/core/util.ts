export const rand = (a: number, b: number) => a + Math.random() * (b - a)
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by)

export function shuffle<T>(a: T[]): T[] {
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[a[i], a[j]] = [a[j], a[i]]
	}
	return a
}

export function weightedPick<T>(items: readonly T[], weight: (t: T) => number): T | null {
	let total = 0
	for (const it of items) total += Math.max(0, weight(it))
	if (total <= 0) return null
	let r = Math.random() * total
	for (const it of items) {
		r -= Math.max(0, weight(it))
		if (r <= 0) return it
	}
	return items[items.length - 1]
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour */
export function shade(hex: string, amt: number): string {
	const n = parseInt(hex.slice(1), 16)
	let r = n >> 16, g = (n >> 8) & 255, b = n & 255
	const to = amt < 0 ? 0 : 255, t = Math.abs(amt)
	r = Math.round(r + (to - r) * t)
	g = Math.round(g + (to - g) * t)
	b = Math.round(b + (to - b) * t)
	return `rgb(${r},${g},${b})`
}

export const store = {
	get<T>(k: string): T | null {
		try {
			return JSON.parse(localStorage.getItem(k) || 'null') as T | null
		} catch {
			return null
		}
	},
	set(k: string, v: unknown) {
		try {
			localStorage.setItem(k, JSON.stringify(v))
		} catch {
			/* storage unavailable (private mode / OBS without profile) */
		}
	},
	del(k: string) {
		try {
			localStorage.removeItem(k)
		} catch {
			/* ignore */
		}
	},
}
