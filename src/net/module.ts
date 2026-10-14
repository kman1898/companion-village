import { moduleLinks, params } from '../core/settings'
import { applyRemote, snapshot, type RemoteAction } from '../game/remote'
import { G } from '../game/state'
import { crossesToLocalNetwork } from './companion'

/*
 * Sync with the Companion Village module (companion-module/ in this repo).
 * Every half second: POST our state to each module link, run the actions it queued for us.
 * The body is sent as text/plain so the browser does not need a CORS preflight.
 */

export type LinkState = 'connecting' | 'ok' | 'offline' | 'blocked'
export interface LinkInfo { state: LinkState; tribe: string; label: string; boot: string; since: number | null; last: number }
export const links = new Map<string, LinkInfo>()

const page = Math.random().toString(36).slice(2, 10)
let timer = 0
let useAddressSpace = true

async function post(host: string, body: string) {
	const ctl = new AbortController()
	const to = setTimeout(() => ctl.abort(), 2500)
	const init: RequestInit & { targetAddressSpace?: string } = {
		method: 'POST', cache: 'no-store', signal: ctl.signal, body, headers: { 'Content-Type': 'text/plain' },
	}
	if (crossesToLocalNetwork(host) && useAddressSpace) init.targetAddressSpace = 'local'
	try {
		return await fetch(`http://${host}/sync`, init)
	} catch (e) {
		if (init.targetAddressSpace && e instanceof TypeError && /targetAddressSpace|enum/i.test(String(e.message))) {
			useAddressSpace = false
			delete init.targetAddressSpace
			return fetch(`http://${host}/sync`, init)
		}
		throw e
	} finally {
		clearTimeout(to)
	}
}

async function syncOne(host: string, state: unknown) {
	let info = links.get(host)
	if (!info) links.set(host, (info = { state: 'connecting', tribe: '', label: '', boot: '', since: null, last: 0 }))
	try {
		const res = await post(host, JSON.stringify({ v: 1, page, since: info.since, state }))
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const r = (await res.json()) as { boot: string; seq: number; tribe: string; label: string; actions: (RemoteAction & { seq: number })[] }
		if (r.boot !== info.boot) {
			// the module restarted (or first contact): start from its current position
			info.boot = r.boot
			info.since = r.seq
		} else {
			for (const a of r.actions) if (a.seq > (info.since ?? 0)) applyRemote(a, host)
			info.since = r.seq
		}
		info.state = 'ok'
		info.tribe = r.tribe
		info.label = r.label
		info.last = Date.now()
	} catch {
		info.state = location.protocol === 'https:' ? 'blocked' : 'offline'
	}
}

export async function syncModules() {
	clearTimeout(timer)
	const hosts = params.demo >= 0 ? [] : moduleLinks()
	for (const h of [...links.keys()]) if (!hosts.includes(h)) links.delete(h)
	if (hosts.length && G.S) {
		const state = snapshot()
		await Promise.all(hosts.map((h) => syncOne(h, state)))
	}
	timer = window.setTimeout(syncModules, hosts.length ? 500 : 2000)
}
