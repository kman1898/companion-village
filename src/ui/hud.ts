import { settings } from '../core/settings'
import { fmt } from '../core/util'
import { B, ROLE, type Role } from '../data/buildings'
import { ERAS, INVENTIONS } from '../data/inventions'
import { TRIBES, TRIBE_IDS } from '../data/tribes'
import { roleCounts } from '../game/buildings'
import { clockText } from '../game/daynight'
import { stance, STANCE_ICON } from '../game/diplomacy'
import { EVENTS, eventsOf } from '../game/events'
import { eraName, eraOf, inventionsFor } from '../game/history'
import { G, player, popOf, relation } from '../game/state'
import { inventionPace, isAI } from '../game/tribes'
import { power, siegeLevel } from '../game/war'
import { SIEGE_NAMES } from '../data/tribes'
import { conns, crossesToLocalNetwork } from '../net/companion'
import { links } from '../net/module'
import { cam, followNow, followSecondsLeft, lookAt } from '../view/camera'

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
	$('dip-btn').addEventListener('click', () => toggleModal('diplomacy'))
	$('cam-follow').addEventListener('click', () => followNow())
	$('status-help').addEventListener('click', () => toggleModal('help'))
	$('tribes').addEventListener('click', (e) => {
		const row = (e.target as HTMLElement).closest('[data-tribe]') as HTMLElement | null
		if (row) lookAt(row.dataset.tribe as never)
	})
	for (const b of document.querySelectorAll<HTMLElement>('[data-close]')) b.addEventListener('click', closeModals)
}

type ModalId = 'inventions' | 'settings' | 'help' | 'diplomacy' | 'choose'
export function toggleModal(id: ModalId) {
	const el = $(id)
	const show = el.hidden
	closeModals()
	if (show) {
		if (id === 'inventions') renderInventions()
		if (id === 'diplomacy') renderDiplomacy()
		el.hidden = false
	}
}
export function closeModals() {
	for (const m of document.querySelectorAll<HTMLElement>('.modal')) if (m.id !== 'choose' || settings.chosen) m.hidden = true
}

export function updateHud() {
	const S = G.S
	const T = player()
	const info = TRIBES[T.id]
	const pop = popOf(T)
	set('tribe-name', `<span>${info.icon}</span><span style="color:${info.color}">${info.name}</span><span class="lbl">· ${info.dept}</span>`, true)
	set('year', `Year ${T.year}`)
	set('era', eraName(T))
	set('clock', clockText())
	const wars = S.tribes.filter((o) => o !== T && relation(T.id, o.id).war)
	set('warline', wars.length ? `⚔️ at war with ${wars.map((o) => TRIBES[o.id].name).join(' & ')}` : '')
	set('pop', pop)
	set('poplbl', pop === 1 ? 'villager' : 'villagers')
	set('r-wood', fmt(T.stock.wood))
	set('r-stone', fmt(T.stock.stone))
	set('r-food', fmt(T.stock.food))
	set('r-bld', T.buildings.filter((b) => b.done && b.type !== 'graveyard' && b.type !== 'landmark').length)
	const c = roleCounts(T)
	set('roles', (Object.keys(ROLE) as Role[]).map((r) => `<span><i style="background:${ROLE[r].color}"></i>${c[r]} ${ROLE[r].label}${c[r] === 1 ? '' : 's'}</span>`).join(''), true)
	const sites = T.buildings.filter((b) => !b.done).slice(0, 3)
	set('now', sites.map((b) => `<div><span>${b.repair ? '🔧' : '⚒'} <em>${B[b.type].name}</em></span><span>${Math.round((b.progress / B[b.type].work) * 100)}%</span></div>`).join(''), true)
	const ev = eventsOf(T.id)[0] || S.events.find((e) => !e.tribe && e.type !== 'raid')
	const def = ev ? EVENTS[ev.type] : null
	let evText = ''
	if (ev && def) {
		evText = ev.type === 'raid'
			? `⚔️ ${TRIBES[ev.d.att as keyof typeof TRIBES].name} vs ${TRIBES[ev.d.def as keyof typeof TRIBES].name} · ${ev.d.phase}`
			: `${def.icon} ${def.name}${ev.dur > 3 ? ` · ${Math.ceil(ev.dur - ev.t)}s` : ''}`
	}
	set('event-line', evText)
	$('event-line').classList.toggle('good', !!def?.good)
	set('inv-count', T.inventions.length)
	const remaining = inventionsFor(T).length - T.inventions.length
	set('inv-next', remaining ? String(Math.max(1, inventionPace(T) - (T.year - T.lastInventionYear))) : '—')

	// scoreboard
	set('tribes', S.tribes.map((o) => {
		const me = o.id === T.id
		const st = me ? '' : STANCE_ICON[stance(relation(T.id, o.id))]
		const ctl = isAI(o) ? '🤖' : '🎛️'
		return `<div class="tr${me ? ' me' : ''}" data-tribe="${o.id}" title="Click to look at ${TRIBES[o.id].name}">
			<span class="nm" style="color:${TRIBES[o.id].color}">${TRIBES[o.id].icon} ${TRIBES[o.id].name}${me ? ' (you)' : ''}</span>
			<span class="num" title="villagers">👥 ${popOf(o)}</span>
			<span class="era" title="year · era">Y${o.year} · ${ERAS[eraOf(o)].name.split(' ')[0]}</span>
			<span title="${me ? '' : stance(relation(T.id, o.id))} · ${isAI(o) ? 'AI' : 'Companion'}">${st} ${ctl}</span></div>`
	}).join(''), true)

	// connections
	const parts = TRIBE_IDS.map((id) => {
		const c = conns[id]
		if (c.state === 'ai') return ''
		const cls = c.state === 'ok' ? 'ok' : c.state === 'offline' || c.state === 'blocked' ? 'bad' : ''
		const txt = c.state === 'ok' ? `${c.value}` : c.state === 'novar' ? 'no presses yet' : c.state === 'connecting' ? '…' : 'offline'
		return `<span class="conn" title="${settings.tribes[id].host} · ${settings.tribes[id].variable}"><i class="dot ${cls}"></i>${TRIBES[id].icon} ${txt}</span>`
	}).filter(Boolean)
	for (const [host, l] of links) {
		const cls = l.state === 'ok' ? 'ok' : l.state === 'connecting' ? '' : 'bad'
		parts.push(`<span class="conn" title="Companion module at ${host}"><i class="dot ${cls}"></i>🎛️ ${l.state === 'ok' ? l.label || 'module' : host}</span>`)
	}
	set('status-text', parts.length ? parts.join(' ') : '🤖 All tribes on autopilot — connect Companion in Settings', true)
	$('status-help').hidden = !(TRIBE_IDS.some((id) => conns[id].state === 'blocked' || (conns[id].state === 'offline' && crossesToLocalNetwork(settings.tribes[id].host))) || [...links.values()].some((l) => l.state === 'blocked'))
	$('pausepill').hidden = !G.paused

	const wait = $('wait')
	wait.style.display = pop === 0 && T.queue === 0 && settings.chosen ? 'block' : 'none'
	if (pop === 0) {
		const cs = conns[T.id].state
		set('wait-s', cs === 'offline' || cs === 'blocked' ? `Can't reach Companion at ${settings.tribes[T.id].host} — check Settings`
			: cs === 'novar' ? 'Press any button on your Stream Deck to send the first settler'
				: isAI(T) ? 'Your tribe is on autopilot — it will grow by itself' : 'Each button press brings a new villager and another year')
	}

	$('campill').hidden = cam.follow
	if (!cam.follow) set('cam-secs', followSecondsLeft())
	if (!$('diplomacy').hidden) renderDiplomacy()
}

function renderInventions() {
	const S = G.S
	const T = player()
	const yearOf = new Map<string, number>()
	for (const h of S.history) {
		if (h.tribe !== T.id) continue
		const inv = INVENTIONS.find((i) => h.text.endsWith(i.name))
		if (inv && !yearOf.has(inv.id)) yearOf.set(inv.id, h.year)
	}
	const all = inventionsFor(T)
	$('inv-sum').textContent = `· ${TRIBES[T.id].name} · ${T.inventions.length} of ${all.length}`
	let html = ''
	ERAS.forEach((era, e) => {
		const list = all.filter((i) => i.era === e)
		const known = list.filter((i) => T.inventions.includes(i.id))
		html += `<div class="era-h">${era.name} · ${known.length}/${list.length}</div>`
		html += known.map((i) => `<div class="inv"><b>${i.icon} ${i.name}${i.tribe ? ' ★' : ''}</b><small>${yearOf.has(i.id) ? `Year ${yearOf.get(i.id)} · ` : ''}${i.desc}</small></div>`).join('')
		html += list.filter((i) => !T.inventions.includes(i.id)).map((i) => `<div class="inv unknown"><b>❔ ${i.tribe ? 'Signature invention' : 'Undiscovered'}</b><small>Keep pressing…</small></div>`).join('')
	})
	$('inv-list').innerHTML = html
	$('history').innerHTML = S.history.length
		? [...S.history].reverse().slice(0, 120).map((h) => `<div><b>Year ${h.year}</b> ${h.icon} ${h.text}</div>`).join('')
		: '<div>Nothing has happened yet. Every button press is a year in the life of the village.</div>'
}

function renderDiplomacy() {
	const S = G.S
	$('dip-tribes').innerHTML = S.tribes.map((T) => {
		const i = TRIBES[T.id]
		const sl = siegeLevel(T)
		return `<div class="card"><h3 style="color:${i.color}">${i.icon} ${i.name}${T.id === S.player ? ' (you)' : ''}</h3>
			<dl><dt>Villagers</dt><dd>${popOf(T)}</dd><dt>Year</dt><dd>${T.year} · ${eraName(T)}</dd>
			<dt>Inventions</dt><dd>${T.inventions.length}</dd><dt>Battles</dt><dd>${T.wins} won · ${T.losses} lost</dd>
			<dt>Army</dt><dd>power ${power(T)}${sl >= 0 ? ` · ${SIEGE_NAMES[sl]}` : ''}</dd><dt>Prestige</dt><dd>${Math.round(T.prestige)}</dd>
			<dt>Temper</dt><dd>${T.personality.aggression > 0.6 ? 'hot-headed' : T.personality.aggression < 0.3 ? 'peaceful' : 'steady'}, ${T.personality.trade > 0.6 ? 'loves trade' : 'self-reliant'}</dd>
			<dt>Driven by</dt><dd>${isAI(T) ? 'AI' : settings.tribes[T.id].control === 'module' ? 'Companion module' : `Companion (${settings.tribes[T.id].variable})`}</dd></dl></div>`
	}).join('')
	$('dip-rel').innerHTML = S.relations.map((r) => {
		const st = stance(r)
		const pct = (r.value + 100) / 2
		return `<div class="rel"><span>${TRIBES[r.a].icon} ${TRIBES[r.a].name} ↔ ${TRIBES[r.b].icon} ${TRIBES[r.b].name}</span>
			<span class="bar" title="${Math.round(r.value)}"><i style="left:calc(${pct}% - 2px)"></i></span>
			<span>${STANCE_ICON[st]} ${st}${r.trades ? ` · ${r.trades} trades` : ''}</span></div>`
	}).join('')
	const dipIcons = new Set(['⚔️', '🕊️', '🤝', '🏆', '🎸', '💒', '📚', '🕵️', '🌌'])
	const list = S.history.filter((h) => dipIcons.has(h.icon)).reverse().slice(0, 40)
	$('dip-history').innerHTML = list.length ? list.map((h) => `<div><b>Year ${h.year}</b> ${h.icon} ${h.text}</div>`).join('') : '<div>No wars, treaties or alliances yet.</div>'
}

