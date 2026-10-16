#!/usr/bin/env node
// Builds Companion triggers that turn mixing / lighting desk activity into village years, fairly.
//
// Each trigger watches the variables of a desk connection (X32, WING, Yamaha, MagicQ, Generic OSC for grandMA3)
// and runs "Companion Village: Desk activity (fair count)", which counts a fader move, a key press or a
// scene recall as ONE action, whatever number of values it changes.
//
// Usage:
//   node tools/desk-triggers.mjs <desk> [options]
//
//   desks:  x32          Behringer X32 / Midas M32        (module behringer-x32)
//           wing         Behringer WING                   (module behringer-wing)
//           yamaha-cl    Yamaha CL5 / CL3 / CL1 / QL      (module yamaha-rcp 4.x)
//           yamaha-dm3   Yamaha DM3                       (module yamaha-rcp 4.x)
//           magicq       ChamSys MagicQ, playbacks 1-10   (module chamsys-magicq-osc, "feedback" enabled)
//           gma3         grandMA3 OSC output              (module generic-osc, "Listen for Feedback" enabled)
//           osc          any desk sending OSC             (module generic-osc), e.g. MagicQ OSC transmit
//
//   --install [host:port]  import the trigger into Companion (default localhost:8888); connections are found by module
//   --connection <label>   label of the desk connection (default: the one found, or x32 / wing / yamaha / magicq / osc)
//   --village <label>      label of the Companion Village connection (default: the one found, or village)
//   --tribe <id>           pixels | noises | lampys (default noises for sound desks, lampys for lighting)
//   --name <desk name>     name used for counting and limits, e.g. FOH, MON (default: the desk type)
//   --channels <n>         watch only the first n input channels
//   --no-mutes             faders only
//   --replace              with --install: replace a trigger of the same name
//   --out <file>           write a .companionconfig to import by hand (Companion → Import / Export)
//
// Without --install or --out the file is written to tools/desk-triggers/<desk>.companionconfig.

import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const args = process.argv.slice(2)
const has = (k) => args.includes(k)
const flag = (k) => {
	const i = args.indexOf(k)
	return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined
}
const desk = args[0]
const pad2 = (n) => String(n).padStart(2, '0')
const range = (n) => Array.from({ length: n }, (_, i) => i + 1)
const uid = () => randomBytes(12).toString('base64url')

/*
 * A recipe lists the controls to watch. Each control is a module variable (`variable`) or a
 * trigger-local variable fed by a desk feedback (`feedback`), so mutes and Yamaha levels work too.
 */
const RECIPES = {
	x32: {
		title: 'Behringer X32 / M32',
		module: 'behringer-x32',
		label: 'x32',
		tribe: 'noises',
		build: ({ channels, mutes, version }) => {
			// 4.x names mute targets channel1 / bus3 / dca2 …; 3.x uses the OSC path
			const v4 = !version || parseInt(version, 10) >= 4 || version === 'dev'
			const strips = [
				...range(channels ?? 32).map((n) => ['ch' + n, `ch_${pad2(n)}`, `channel${n}`, `/ch/${pad2(n)}`]),
				...range(8).map((n) => ['aux' + n, `auxin_${pad2(n)}`, `aux${n}`, `/auxin/${pad2(n)}`]),
				...range(8).map((n) => ['fx' + n, `fxrtn_${pad2(n)}`, `fx${n}`, `/fxrtn/${pad2(n)}`]),
				...range(16).map((n) => ['bus' + n, `bus_${pad2(n)}`, `bus${n}`, `/bus/${pad2(n)}`]),
				...range(6).map((n) => ['mtx' + n, `mtx_${pad2(n)}`, `matrix${n}`, `/mtx/${pad2(n)}`]),
				...range(8).map((n) => ['dca' + n, `dca_${n}`, `dca${n}`, `/dca/${n}`]),
				['main', 'main_st', 'stereo', '/main/st'],
				['mono', 'main_m', 'mono', '/main/m'],
			]
			const out = []
			for (const [name, prefix, ref, oscPath] of strips) {
				out.push({ name: `${name}_fader`, variable: `fader_${prefix}` })
				if (mutes)
					out.push({
						name: `${name}_mute`,
						feedback: 'mute',
						options: v4 ? { target: ref } : { target: oscPath, state: true },
					})
			}
			out.push({ name: 'select', variable: 'selected_channel' })
			return out
		},
	},
	wing: {
		title: 'Behringer WING',
		module: 'behringer-wing',
		label: 'wing',
		tribe: 'noises',
		build: ({ channels, mutes }) => {
			const strips = [
				...range(channels ?? 40).map((n) => 'ch' + n),
				...range(8).map((n) => 'aux' + n),
				...range(16).map((n) => 'bus' + n),
				...range(4).map((n) => 'main' + n),
				...range(8).map((n) => 'mtx' + n),
				...range(16).map((n) => 'dca' + n),
			]
			const out = []
			for (const s of strips) {
				out.push({ name: `${s}_level`, variable: `${s}_level` })
				if (mutes) out.push({ name: `${s}_mute`, variable: `${s}_mute` })
			}
			return out
		},
	},
	'yamaha-cl': {
		title: 'Yamaha CL / QL',
		module: 'yamaha-rcp',
		label: 'yamaha',
		tribe: 'noises',
		build: (o) => yamaha(o, { InCh: o.channels ?? 72, StInCh: 16, Mix: 24, Mtrx: 8, St: 3, DCA: 16 }),
	},
	'yamaha-dm3': {
		title: 'Yamaha DM3',
		module: 'yamaha-rcp',
		label: 'yamaha',
		tribe: 'noises',
		build: (o) => yamaha(o, { InCh: o.channels ?? 16, StInCh: 2, FxRtnCh: 4, Mix: 6, Mtrx: 2, St: 2 }),
	},
	magicq: {
		title: 'ChamSys MagicQ',
		module: 'chamsys-magicq-osc',
		label: 'magicq',
		tribe: 'lampys',
		build: () =>
			range(10).flatMap((n) => [
				{ name: `pb${n}`, variable: `pb${n}` },
				{ name: `pb${n}_flash`, variable: `pb${n}_flash` },
			]),
	},
	gma3: {
		title: 'grandMA3',
		module: 'generic-osc',
		label: 'osc',
		tribe: 'lampys',
		event: true,
	},
	osc: {
		title: 'OSC desk',
		module: 'generic-osc',
		label: 'osc',
		tribe: 'lampys',
		event: true,
	},
}

/** Yamaha RCP 4.x has a value feedback for every readable parameter: <address>_Value with the channel as X */
function yamaha({ mutes }, counts) {
	const out = []
	for (const [cmd, n] of Object.entries(counts)) {
		for (const x of range(n)) {
			const name = `${cmd.toLowerCase()}${x}`
			out.push({ name: `${name}_level`, feedback: `MIXER_Current/${cmd}/Fader/Level_Value`, options: { X: x } })
			if (mutes) out.push({ name: `${name}_on`, feedback: `MIXER_Current/${cmd}/Fader/On_Value`, options: { X: x } })
		}
	}
	return out
}

const recipe = RECIPES[desk]
if (!recipe) {
	console.error(`Usage: node tools/desk-triggers.mjs <${Object.keys(RECIPES).join(' | ')}> [--install [host:port]] [--out file]`)
	console.error('See the top of this file for all options.')
	process.exit(1)
}

const opt = (v) => ({ isExpression: false, value: v })
const VILLAGE_ID = 'villageConnection'
const DESK_ID = 'deskConnection'

function buildConfig({ deskLabel, villageLabel, version }) {
	const tribe = flag('--tribe') || recipe.tribe
	const name = flag('--name') || recipe.title
	const channels = flag('--channels') ? Math.max(1, parseInt(flag('--channels'), 10)) : undefined
	const trigger = {
		type: 'trigger',
		options: { name: `Village desk: ${name}`, enabled: true, sortOrder: 0 },
		actions: [],
		condition: [],
		events: [],
		localVariables: [],
	}
	const action = {
		id: uid(),
		definitionId: 'desk_activity',
		connectionId: VILLAGE_ID,
		type: 'action',
		options: {
			tribe: opt(tribe),
			desk: opt(name),
			mode: opt(recipe.event ? 'event' : 'values'),
			values: opt(''),
			control: opt(''),
			ignore: opt(''),
		},
	}
	if (recipe.event) {
		// Generic OSC updates these on every message it receives
		trigger.events.push({
			id: uid(),
			type: 'variable_changed',
			enabled: true,
			options: { variableId: `${deskLabel}:latest_received_timestamp` },
		})
		action.options.control = opt(`$(${deskLabel}:latest_received_path)`)
	} else {
		const controls = recipe.build({ channels, mutes: !has('--no-mutes'), version })
		const lines = []
		for (const c of controls) {
			let ref
			if (c.variable) ref = `${deskLabel}:${c.variable}`
			else {
				ref = `local:${c.name}`
				trigger.localVariables.push({
					id: uid(),
					type: 'feedback',
					definitionId: c.feedback,
					connectionId: DESK_ID,
					options: Object.fromEntries(Object.entries(c.options).map(([k, v]) => [k, opt(v)])),
					variableName: c.name,
					isInverted: false,
				})
			}
			trigger.events.push({ id: uid(), type: 'variable_changed', enabled: true, options: { variableId: ref } })
			lines.push(`${c.name}=$(${ref})`)
		}
		action.options.values = opt(lines.join('\n'))
	}
	trigger.actions.push(action)
	const triggerId = uid()
	return {
		triggerId,
		trigger,
		config: {
			type: 'trigger_list',
			version: 12,
			triggers: { [triggerId]: trigger },
			instances: {
				[VILLAGE_ID]: { moduleInstanceType: 'connection', moduleId: 'companion-village', label: villageLabel, config: {}, enabled: true },
				[DESK_ID]: { moduleInstanceType: 'connection', moduleId: recipe.module, label: deskLabel, config: {}, enabled: true },
			},
		},
	}
}

function summary(trigger) {
	const vars = trigger.localVariables.length
	return `${trigger.events.length} watched value(s)${vars ? `, ${vars} of them from desk feedbacks` : ''}`
}

const installArg = args.indexOf('--install')
if (installArg < 0) {
	const here = path.dirname(fileURLToPath(import.meta.url))
	const out = flag('--out') || path.join(here, 'desk-triggers', `${desk}.companionconfig`)
	const { trigger, config } = buildConfig({
		deskLabel: flag('--connection') || recipe.label,
		villageLabel: flag('--village') || 'village',
	})
	mkdirSync(path.dirname(out), { recursive: true })
	writeFileSync(out, JSON.stringify(config, null, '\t') + '\n')
	console.log(`Wrote ${out}: trigger "${trigger.options.name}", ${summary(trigger)}.`)
	console.log(`Import it in Companion → Import / Export. It expects the desk connection to be labelled "${flag('--connection') || recipe.label}".`)
	process.exit(0)
}

// ---- install straight into Companion over its tRPC websocket (same flow as the web UI import) ----

const next = args[installArg + 1]
const host = next && !next.startsWith('--') ? next : 'localhost:8888'
if (typeof WebSocket === 'undefined') {
	console.error('This script needs Node.js 22 or newer (global WebSocket).')
	process.exit(1)
}

async function connections() {
	const res = await fetch(`http://${host}/int/export/full?format=json`)
	if (!res.ok) throw new Error(`Companion export failed (${res.status})`)
	const all = await res.json()
	return { list: Object.entries(all.instances || {}), triggers: Object.entries(all.triggers || {}) }
}

function pick(list, moduleId, label, what) {
	const mine = list.filter(([, c]) => c.moduleId === moduleId)
	const found = label ? mine.find(([, c]) => c.label === label) : mine.length === 1 ? mine[0] : undefined
	if (found) return found
	if (label) throw new Error(`No ${what} connection labelled "${label}" (module ${moduleId}).`)
	if (!mine.length) throw new Error(`No ${what} connection found. Add the ${moduleId} module in Companion first.`)
	throw new Error(`Several ${what} connections (${mine.map(([, c]) => c.label).join(', ')}): pick one with --${what === 'village' ? 'village' : 'connection'}.`)
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
function call(p, input) {
	const id = nextId++
	ws.send(JSON.stringify({ id, method: 'mutation', params: { path: p, input } }))
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject })
		setTimeout(() => {
			if (pending.delete(id)) reject(new Error(`Timeout calling ${p}`))
		}, 15000)
	})
}
ws.addEventListener('error', () => {
	console.error(`Could not connect to Companion at ws://${host}/trpc`)
	process.exit(1)
})
ws.addEventListener('open', async () => {
	try {
		const { list, triggers } = await connections()
		const [villageId, village] = pick(list, 'companion-village', flag('--village'), 'village')
		const [deskId, deskConn] = pick(list, recipe.module, flag('--connection'), 'desk')
		if (!deskConn.enabled) console.warn(`Note: the connection "${deskConn.label}" is disabled; enable it so its variables update.`)
		if (recipe.module === 'generic-osc' && !deskConn.config?.listen)
			console.warn(`Note: turn on "Listen for Feedback" in the "${deskConn.label}" connection and point the desk's OSC output at its port.`)
		if (recipe.module === 'chamsys-magicq-osc' && !deskConn.config?.enableFeedback)
			console.warn(`Note: enable feedback in the "${deskConn.label}" connection, or its playback variables stay empty.`)
		if (recipe.module === 'yamaha-rcp' && parseInt(deskConn.moduleVersionId, 10) < 4)
			console.warn(`Note: yamaha-rcp ${deskConn.moduleVersionId} has no value feedbacks; update the module to 4.x.`)

		const { triggerId, trigger, config } = buildConfig({
			deskLabel: deskConn.label,
			villageLabel: village.label,
			version: deskConn.moduleVersionId,
		})
		const existing = triggers.filter(([, t]) => t?.options?.name === trigger.options.name)
		if (existing.length && !has('--replace')) {
			console.log(`Trigger "${trigger.options.name}" already exists. Use --replace to install it again, or --name for another desk.`)
			process.exit(0)
		}
		for (const [id] of existing) await call('controls.triggers.delete', { controlId: `trigger:${id}` })
		const file = Buffer.from(JSON.stringify(config))
		const sessionId = await call('importExport.prepareImport.start', { name: `${desk}.companionconfig`, size: file.length })
		const CHUNK = 512 * 1024
		for (let off = 0; off < file.length; off += CHUNK)
			await call('importExport.prepareImport.uploadChunk', { sessionId, offset: off, data: file.subarray(off, off + CHUNK).toString('base64') })
		const checksum = createHash('sha1').update(file).digest('hex')
		const prepared = await call('importExport.prepareImport.complete', { sessionId, expectedChecksum: checksum, userData: null })
		if (Array.isArray(prepared) && prepared[0]) throw new Error(`Import rejected: ${prepared[0]}`)
		await call('importExport.importTriggers', {
			selectedTriggerIds: [triggerId],
			connectionIdRemapping: { [VILLAGE_ID]: villageId, [DESK_ID]: deskId },
			replaceExisting: false,
		})
		console.log(`Installed trigger "${trigger.options.name}" (${summary(trigger)}) for "${deskConn.label}" → ${flag('--tribe') || recipe.tribe}.`)
		process.exit(0)
	} catch (e) {
		console.error('Install failed:', e.message)
		process.exit(1)
	}
})
