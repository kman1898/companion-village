import { anyCompanion, params, settings } from '../core/settings'
import { TRIBE_IDS, TRIBES, type TribeId } from '../data/tribes'
import { command } from '../game/diplomacy'
import { G, tribeOf } from '../game/state'
import { addYears } from '../game/tribes'
import { ticker } from '../ui/notify'

export type ConnState = 'connecting' | 'ok' | 'novar' | 'offline' | 'blocked' | 'ai'
export interface ConnInfo { state: ConnState; value: number | null; lastCmd: string }
export const conns = Object.fromEntries(TRIBE_IDS.map((id) => [id, { state: 'connecting', value: null, lastCmd: '' } as ConnInfo])) as Record<TribeId, ConnInfo>

const isLoopback = (host: string) => /^(localhost|127\.|\[::1\])/i.test(host)
/** An https page (GitHub Pages) talking to plain-http Companion on the LAN */
export const crossesToLocalNetwork = (host: string) => location.protocol === 'https:' && !isLoopback(host)

let useAddressSpace = true
async function request(host: string, path: string, method = 'GET') {
	const ctl = new AbortController()
	const to = setTimeout(() => ctl.abort(), 2500)
	const init: RequestInit & { targetAddressSpace?: string } = { cache: 'no-store', signal: ctl.signal, method }
	// Chrome's Local Network Access: lets an https page reach http:// devices on the LAN after a one-time permission prompt
	if (crossesToLocalNetwork(host) && useAddressSpace) init.targetAddressSpace = 'local'
	try {
		return await fetch(`http://${host}${path}`, init)
	} catch (e) {
		if (init.targetAddressSpace && e instanceof TypeError && /targetAddressSpace|enum/i.test(String(e.message))) {
			useAddressSpace = false
			return fetch(`http://${host}${path}`, { cache: 'no-store', signal: ctl.signal, method })
		}
		throw e
	} finally {
		clearTimeout(to)
	}
}

function onCounter(id: TribeId, n: number) {
	const T = tribeOf(id)
	conns[id].value = n
	if (T.lastCounter === null) {
		T.lastCounter = n
		return
	}
	let delta = 0
	if (n > T.lastCounter) delta = n - T.lastCounter
	else if (n < T.lastCounter) delta = Math.max(0, n) // Companion restarted / counter reset
	T.lastCounter = n
	addYears(T, delta)
}

async function pollTribe(id: TribeId) {
	const c = settings.tribes[id]
	const info = conns[id]
	try {
		const res = await request(c.host, `/api/custom-variable/${encodeURIComponent(c.variable)}/value`)
		if (res.status === 404) info.state = 'novar'
		else if (!res.ok) info.state = 'offline'
		else {
			const n = Number((await res.text()).trim())
			info.state = 'ok'
			if (Number.isFinite(n)) onCounter(id, Math.floor(n))
		}
		if (c.cmd && info.state !== 'offline') await pollCommand(id)
	} catch {
		info.state = location.protocol === 'https:' ? 'blocked' : 'offline'
	}
}

/** Command variable: a Companion button sets it to e.g. "attack:noises"; we run it and clear the variable */
async function pollCommand(id: TribeId) {
	const c = settings.tribes[id]
	const res = await request(c.host, `/api/custom-variable/${encodeURIComponent(c.cmd)}/value`)
	if (!res.ok) return
	const value = (await res.text()).trim()
	if (!value) return
	const result = command(tribeOf(id), value)
	conns[id].lastCmd = `${value} → ${result}`
	ticker(`${TRIBES[id].name} command “${value}”: ${result}`, '🎛️', TRIBES[id].color)
	await request(c.host, `/api/custom-variable/${encodeURIComponent(c.cmd)}/value?value=`, 'POST').catch(() => {})
}

let timer = 0
export async function poll() {
	clearTimeout(timer)
	if (params.demo >= 0 || !G.S) {
		for (const id of TRIBE_IDS) conns[id].state = 'ai'
		return
	}
	await Promise.all(
		TRIBE_IDS.map((id) => {
			if (settings.tribes[id].control !== 'companion') {
				conns[id].state = 'ai'
				return Promise.resolve()
			}
			return pollTribe(id)
		}),
	)
	const allOk = TRIBE_IDS.every((id) => conns[id].state === 'ok' || conns[id].state === 'ai' || conns[id].state === 'novar')
	timer = window.setTimeout(poll, anyCompanion() && allOk ? settings.poll : 2000)
}
