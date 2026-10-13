import { B, ROLE } from '../data/buildings'
import { G, type Building, type Villager } from '../game/state'
import { cam, followNow, overview, panBy, screenToWorld, zoomAt } from './camera'

export const hover: { obj: Villager | Building | null } = { obj: null }

const pointers = new Map<number, { x: number; y: number }>()
let dragging = false
let downAt = { x: 0, y: 0 }
let pinchDist = 0
const keys = new Set<string>()
let tooltip: HTMLElement

export function initInput(canvas: HTMLCanvasElement) {
	tooltip = document.getElementById('tooltip')!

	canvas.addEventListener('pointerdown', (e) => {
		canvas.setPointerCapture(e.pointerId)
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
		downAt = { x: e.clientX, y: e.clientY }
		dragging = false
		if (pointers.size === 2) pinchDist = currentPinch()
	})
	canvas.addEventListener('pointermove', (e) => {
		const p = pointers.get(e.pointerId)
		if (!p) {
			updateHover(e.clientX, e.clientY)
			return
		}
		if (pointers.size === 1) {
			if (!dragging && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) dragging = true
			if (dragging) {
				panBy(e.clientX - p.x, e.clientY - p.y)
				canvas.style.cursor = 'grabbing'
				hideTooltip()
			}
		}
		p.x = e.clientX
		p.y = e.clientY
		if (pointers.size === 2) {
			const d = currentPinch()
			const [a, b] = [...pointers.values()]
			if (pinchDist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist)
			pinchDist = d
		}
	})
	const up = (e: PointerEvent) => {
		pointers.delete(e.pointerId)
		if (pointers.size < 2) pinchDist = 0
		if (!pointers.size) {
			dragging = false
			canvas.style.cursor = ''
		}
	}
	canvas.addEventListener('pointerup', up)
	canvas.addEventListener('pointercancel', up)
	canvas.addEventListener('pointerleave', () => hideTooltip())
	canvas.addEventListener('wheel', (e) => {
		e.preventDefault()
		// trackpad pinch arrives as ctrl+wheel with small deltas
		const k = e.ctrlKey ? 0.012 : e.deltaMode === 1 ? 0.05 : 0.0018
		zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * k))
	}, { passive: false })
	canvas.addEventListener('dblclick', (e) => zoomAt(e.clientX, e.clientY, 1.8))

	window.addEventListener('keydown', (e) => {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
		if (e.key.startsWith('Arrow')) {
			keys.add(e.key)
			e.preventDefault()
		} else if (e.key === '+' || e.key === '=') zoomAt(cam.vw / 2, cam.vh / 2, 1.25)
		else if (e.key === '-' || e.key === '_') zoomAt(cam.vw / 2, cam.vh / 2, 0.8)
		else if (e.key === '0' || e.key === 'Home') followNow()
		else if (e.key === 'm' || e.key === 'M') overview()
	})
	window.addEventListener('keyup', (e) => keys.delete(e.key))
	window.addEventListener('blur', () => keys.clear())
}

function currentPinch() {
	const [a, b] = [...pointers.values()]
	return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}

/** Held arrow keys pan smoothly */
export function updateKeys(dt: number) {
	if (!keys.size) return
	const sp = 700 * dt
	let dx = 0, dy = 0
	if (keys.has('ArrowLeft')) dx += sp
	if (keys.has('ArrowRight')) dx -= sp
	if (keys.has('ArrowUp')) dy += sp
	if (keys.has('ArrowDown')) dy -= sp
	panBy(dx, dy)
}

function updateHover(px: number, py: number) {
	const w = screenToWorld(px, py)
	let best: Villager | Building | null = null, bd = 0.45 * 0.45
	for (const v of G.S.villagers) {
		const d = (v.x - w.x) ** 2 + (v.y - 0.25 - w.y) ** 2
		if (d < bd) {
			bd = d
			best = v
		}
	}
	if (!best)
		for (const b of G.S.buildings)
			if (w.x >= b.ox - 0.1 && w.x <= b.ox + 2.1 && w.y >= b.oy - 0.6 && w.y <= b.oy + 2) {
				best = b
				break
			}
	hover.obj = best
	if (!best) return hideTooltip()
	tooltip.textContent = describe(best)
	tooltip.style.display = 'block'
	tooltip.style.left = px + 14 + 'px'
	tooltip.style.top = py + 14 + 'px'
}

const ACT: Record<string, string> = { chop: 'chopping wood', mine: 'quarrying stone', hammer: 'building', farm: 'tending the fields', walk: 'walking', idle: 'resting', dance: 'dancing', drop: 'working', wave: 'just arrived', fly: 'flying through the air!' }
function describe(o: Villager | Building) {
	if (o.k === 4) {
		const v = o
		const extra = v.sick ? ' · sick' : v.carry ? ` · carrying ${v.carry}` : ''
		return `${v.name} · ${ROLE[v.role].label} · ${ACT[v.anim] || v.anim}${extra}`
	}
	const b = o
	const def = B[b.type]
	if (b.type === 'graveyard') return `Graveyard · ${b.graves || 0} graves`
	if (b.fire) return `${def.name} · on fire!`
	if (!b.done) return `${def.name} · ${b.repair ? 'under repair' : 'under construction'} ${Math.round((b.progress / def.work) * 100)}%`
	return def.name
}

function hideTooltip() {
	hover.obj = null
	if (tooltip) tooltip.style.display = 'none'
}
