import { settings } from '../core/settings'
import { B, ROLE, type Role } from '../data/buildings'
import { ERAS, INVENTIONS } from '../data/inventions'
import { clockText } from '../game/daynight'
import { eraName } from '../game/history'
import { RIVAL_INFO } from '../game/rivals'
import { roleCounts } from '../game/buildings'
import { EVENTS } from '../game/events'
import { G, popCount } from '../game/state'
import { conn, crossesToLocalNetwork } from '../net/companion'
import { cam, followNow, followSecondsLeft } from '../view/camera'

const $ = (id: string) => document.getElementById(id)!
const last = new Map<string, string>()
/** Only touch the DOM when the text actually changed */
function set(id: string, value: string | number, html = false) {
	const v = String(value)
	if (last.get(id) === v) return
	last.set(id, v)
	if (html) $(id).innerHTML = v
	else $(id).textContent = v
}

export function initHud() {
	$('inv-btn').addEventListener('click', () => toggleModal('inventions'))
	$('cam-follow').addEventListener('click', () => followNow())
	$('status-help').addEventListener('click', () => toggleModal('help'))
	for (const b of document.querySelectorAll<HTMLElement>('[data-close]')) b.addEventListener('click', closeModals)
}

export function toggleModal(id: 'inventions' | 'settings' | 'help') {
	const el = $(id)
	const show = el.hidden
	closeModals()
	if (show) {
		if (id === 'inventions') renderInventions()
		el.hidden = false
	}
}
export function closeModals() {
	for (const m of document.querySelectorAll<HTMLElement>('.modal')) m.hidden = true
}

export function updateHud() {
	const S = G.S
	const pop = popCount()
	set('year', `Year ${S.year}`)
	set('era', eraName())
	set('clock', clockText())
	set('rivals', S.rivals.map((r) => `${RIVAL_INFO[r.id].icon} <b>${r.buildings.length}</b> <span title="wins–losses">${r.wins}–${r.losses}</span>`).join(' · '), true)
	set('pop', pop)
	set('poplbl', pop === 1 ? 'villager' : 'villagers')
	set('r-wood', S.stock.wood)
	set('r-stone', S.stock.stone)
	set('r-food', S.stock.food)
	set('r-bld', S.buildings.filter((b) => b.done && b.type !== 'graveyard').length)
	const c = roleCounts()
	set('roles', (Object.keys(ROLE) as Role[]).map((r) => `<span><i style="background:${ROLE[r].color}"></i>${c[r]} ${ROLE[r].label}${c[r] === 1 ? '' : 's'}</span>`).join(''), true)
	const sites = S.buildings.filter((b) => !b.done).slice(0, 3)
	set('now', sites.map((b) => `<div><span>${b.repair ? '🔧' : '⚒'} <em>${B[b.type].name}</em></span><span>${Math.round((b.progress / B[b.type].work) * 100)}%</span></div>`).join(''), true)
	const e = S.event
	const ev = e ? EVENTS[e.type] : null
	set('event-line', ev ? `${ev.icon} ${ev.name}${e!.dur > 3 ? ` · ${Math.ceil(e!.dur - e!.t)}s` : ''}` : '')
	$('event-line').classList.toggle('good', !!ev?.good)
	set('inv-count', S.inventions.length)
	const remaining = INVENTIONS.length - S.inventions.length
	set('inv-next', remaining ? String(Math.max(1, settings.inventionYears - (S.year - S.lastInventionYear))) : '—')

	const wait = $('wait')
	wait.style.display = pop === 0 && S.queue === 0 ? 'block' : 'none'
	if (pop === 0)
		set('wait-s', conn.state === 'offline' || conn.state === 'blocked'
			? `Can't reach Companion at ${settings.host} — check Settings`
			: conn.state === 'novar' ? 'Press any button on your Stream Deck to send the first settler'
				: 'Each button press in Companion brings a new villager and another year')

	// connection status
	const st = $('status')
	st.className = 'panel ' + (conn.state === 'ok' || conn.state === 'demo' ? 'ok' : conn.state === 'offline' || conn.state === 'blocked' ? 'bad' : '')
	set('status-text',
		conn.state === 'demo' ? 'Demo mode — not connected to Companion'
			: conn.state === 'ok' ? `Companion ${settings.host} · ${conn.value} presses`
				: conn.state === 'novar' ? `Companion ${settings.host} · waiting for first press (trigger installed?)`
					: conn.state === 'blocked' ? `Can't reach Companion (${settings.host})`
						: conn.state === 'offline' ? `Companion offline (${settings.host})`
							: 'Connecting…')
	$('status-help').hidden = !(conn.state === 'blocked' || (conn.state === 'offline' && crossesToLocalNetwork()))

	// free camera pill
	$('campill').hidden = cam.follow
	if (!cam.follow) set('cam-secs', followSecondsLeft())
}

function renderInventions() {
	const S = G.S
	const yearOf = new Map<string, number>()
	for (const h of S.history) {
		const inv = INVENTIONS.find((i) => h.text === `Invented ${i.name}`)
		if (inv) yearOf.set(inv.id, h.year)
	}
	$('inv-sum').textContent = `· ${S.inventions.length} of ${INVENTIONS.length}`
	let html = ''
	ERAS.forEach((era, e) => {
		const list = INVENTIONS.filter((i) => i.era === e)
		const known = list.filter((i) => S.inventions.includes(i.id))
		html += `<div class="era-h">${era.name} · ${known.length}/${list.length}</div>`
		html += known.map((i) => `<div class="inv"><b>${i.icon} ${i.name}</b><small>${yearOf.has(i.id) ? `Year ${yearOf.get(i.id)} · ` : ''}${i.desc}</small></div>`).join('')
		html += Array.from({ length: list.length - known.length }, () => `<div class="inv unknown"><b>❔ Undiscovered</b><small>Keep pressing…</small></div>`).join('')
	})
	$('inv-list').innerHTML = html
	$('history').innerHTML = S.history.length
		? [...S.history].reverse().slice(0, 80).map((h) => `<div><b>Year ${h.year}</b> ${h.icon} ${h.text}</div>`).join('')
		: '<div>Nothing has happened yet. Every button press is a year in the life of the village.</div>'
}
