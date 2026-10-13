#!/usr/bin/env node
// Sets up Companion (v4/v5) for Companion Village by driving the same import flow the web UI uses (tRPC over websocket).
//
// Usage:
//   node tools/install-trigger.mjs [host:port] [--var village_presses] [--cmd village_pixels_cmd] [--no-trigger]
//
//   --var   name of the counter variable the "on any button press" trigger increments (default village_presses)
//   --cmd   also create an empty command variable (buttons set it to attack:noises, gift:lampys, festival …)
//   --no-trigger   only create the command variable
//
// Alternative without this script: Companion web UI -> Import / Export -> Import
// and pick village-trigger.companionconfig, then import the trigger.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (k) => {
	const i = args.indexOf(k)
	return i >= 0 ? args[i + 1] : undefined
}
const host = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--no-trigger')) || 'localhost:8888'
const variable = flag('--var') || 'village_presses'
const cmdVar = flag('--cmd')
const wantTrigger = !args.includes('--no-trigger')

const here = path.dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(readFileSync(path.join(here, 'village-trigger.companionconfig'), 'utf8'))
const triggerIds = Object.keys(config.triggers)
const trig = config.triggers[triggerIds[0]]
if (variable !== 'village_presses') {
	trig.options.name = `Village: count button presses (${variable})`
	trig.actions[0].options.name.value = variable
}
const file = Buffer.from(JSON.stringify(config))

if (typeof WebSocket === 'undefined') {
	console.error('This script needs Node.js 22 or newer (global WebSocket).')
	process.exit(1)
}

const ws = new WebSocket(`ws://${host}/trpc`)
let nextId = 1
const pending = new Map()

ws.addEventListener('message', (ev) => {
	const msg = JSON.parse(ev.data)
	const p = pending.get(msg.id)
	if (!p) return
	pending.delete(msg.id)
	if (msg.error) p.reject(new Error(process.env.DEBUG ? JSON.stringify(msg.error) : msg.error.message))
	else p.resolve(msg.result?.data)
})

function call(path, input) {
	const id = nextId++
	ws.send(JSON.stringify({ id, method: 'mutation', params: { path, input } }))
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject })
		setTimeout(() => {
			if (pending.delete(id)) reject(new Error(`Timeout calling ${path}`))
		}, 10000)
	})
}

async function triggerAlreadyInstalled() {
	try {
		const res = await fetch(`http://${host}/int/export/triggers/all?format=json`)
		const all = await res.json()
		return Object.values(all.triggers || {}).some((t) => t?.options?.name === trig.options.name)
	} catch {
		return false
	}
}

async function variableExists(name) {
	const res = await fetch(`http://${host}/api/custom-variable/${encodeURIComponent(name)}/value`)
	return res.status !== 404
}

ws.addEventListener('error', () => {
	console.error(`Could not connect to Companion at ws://${host}/trpc`)
	process.exit(1)
})

ws.addEventListener('open', async () => {
	try {
		if (wantTrigger) {
			if (await triggerAlreadyInstalled()) console.log(`Trigger "${trig.options.name}" already exists.`)
			else {
				const sessionId = await call('importExport.prepareImport.start', { name: 'village-trigger.companionconfig', size: file.length })
				await call('importExport.prepareImport.uploadChunk', { sessionId, offset: 0, data: file.toString('base64') })
				const checksum = createHash('sha1').update(file).digest('hex')
				const prepared = await call('importExport.prepareImport.complete', { sessionId, expectedChecksum: checksum, userData: null })
				if (Array.isArray(prepared) && prepared[0]) throw new Error(`Import rejected: ${prepared[0]}`)
				await call('importExport.importTriggers', { selectedTriggerIds: triggerIds, connectionIdRemapping: {}, replaceExisting: false })
				console.log(`Installed trigger "${trig.options.name}": every button press increments $(custom:${variable}).`)
			}
		}
		if (cmdVar) {
			if (await variableExists(cmdVar)) console.log(`Command variable $(custom:${cmdVar}) already exists.`)
			else {
				const err = await call('customVariables.create', { name: cmdVar, defaultVal: '' })
				if (err) throw new Error(String(err))
				console.log(`Created command variable $(custom:${cmdVar}). Set it from a button to e.g. "attack:noises".`)
			}
		}
		process.exit(0)
	} catch (e) {
		console.error('Install failed:', e.message)
		process.exit(1)
	}
})
