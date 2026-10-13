import { DAY_SECONDS, settings } from '../core/settings'
import { clamp } from '../core/util'
import { G } from './state'

/** Advance the clock. dayTime 0 = midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
export function updateDay(dt: number) {
	const len = DAY_SECONDS[settings.dayLength]
	const S = G.S
	if (!len) {
		// cycle off: drift to late morning and stay there
		S.dayTime += (0.42 - S.dayTime) * Math.min(1, dt)
		return
	}
	S.dayTime = (S.dayTime + dt / len) % 1
}

/** Sun height: -1 at midnight, 1 at noon */
export const sun = () => Math.sin(2 * Math.PI * (G.S.dayTime - 0.25))

/** 0 in daylight … 1 in the dead of night */
export function nightAmount() {
	return clamp(0.35 - sun() * 1.5, 0, 1)
}

/** Warm glow around sunrise and sunset: 0..1 */
export function twilight() {
	const s = sun()
	return clamp(1 - Math.abs(s + 0.05) / 0.3, 0, 1)
}

export const isNight = () => nightAmount() > 0.55

export function clockText() {
	const h = G.S.dayTime * 24
	const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 15) * 15
	const icon = nightAmount() > 0.5 ? '🌙' : twilight() > 0.4 ? '🌅' : '☀️'
	return `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
