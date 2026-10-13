import { settings } from '../core/settings'
import { G } from '../game/state'

export type ConnState = 'connecting' | 'ok' | 'novar' | 'offline' | 'blocked' | 'demo'
export const conn = { state: 'connecting' as ConnState, value: null as number | null }

const isLoopback = (host: string) => /^(localhost|127\.|\[::1\])/i.test(host)
/** An https page (GitHub Pages) talking to plain-http Companion on the LAN */
export const crossesToLocalNetwork = () => location.protocol === 'https:' && !isLoopback(settings.host)

function onCounter(n: number) {
	const S = G.S
	conn.value = n
	if (S.lastCounter === null) {
		S.lastCounter = n
		return
	}
	if (n > S.lastCounter) S.queue += n - S.lastCounter
	else if (n < S.lastCounter) S.queue += Math.max(0, n) // Companion restarted / counter reset
	S.lastCounter = n
}

let pollTimer = 0
let useAddressSpace = true

async function fetchCounter(url: string, signal: AbortSignal) {
	const init: RequestInit & { targetAddressSpace?: string } = { cache: 'no-store', signal }
	// Chrome's Local Network Access: lets an https page reach http:// devices on the LAN after a one-time permission prompt
	if (crossesToLocalNetwork() && useAddressSpace) init.targetAddressSpace = 'local'
	try {
		return await fetch(url, init)
	} catch (e) {
		if (init.targetAddressSpace && e instanceof TypeError && /targetAddressSpace|enum/i.test(String(e.message))) {
			useAddressSpace = false
			return fetch(url, { cache: 'no-store', signal })
		}
		throw e
	}
}

export async function poll() {
	clearTimeout(pollTimer)
	const url = `http://${settings.host}/api/custom-variable/${encodeURIComponent(settings.variable)}/value`
	try {
		const ctl = new AbortController()
		const to = setTimeout(() => ctl.abort(), 2500)
		const res = await fetchCounter(url, ctl.signal)
		clearTimeout(to)
		if (res.status === 404) conn.state = 'novar'
		else if (!res.ok) conn.state = 'offline'
		else {
			const n = Number((await res.text()).trim())
			conn.state = 'ok'
			if (Number.isFinite(n)) onCounter(Math.floor(n))
		}
	} catch {
		conn.state = location.protocol === 'https:' ? 'blocked' : 'offline'
	}
	pollTimer = window.setTimeout(poll, conn.state === 'ok' || conn.state === 'novar' ? settings.poll : 2000)
}

export function stopPolling() {
	clearTimeout(pollTimer)
}
