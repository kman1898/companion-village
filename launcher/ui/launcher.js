// The launcher window. Talks to the app only through window.launcher (src/preload.ts).
const api = window.launcher
const $ = (id) => document.getElementById(id)
let current = null

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function toast(text) {
	const t = document.createElement('div')
	t.className = 'toast'
	t.textContent = text
	document.body.append(t)
	setTimeout(() => t.remove(), 1400)
}

/** Fills a <select> only when its options changed, so an open dropdown isn't reset under the mouse */
function fillSelect(el, options, value) {
	const html = options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')
	if (el.dataset.html !== html) {
		el.innerHTML = html
		el.dataset.html = html
	}
	if (document.activeElement !== el) el.value = value
}

function render(s) {
	current = s
	const st = s.server.state
	$('version').textContent = `v${s.version}`
	const pill = $('pill')
	pill.className = `pill is-${st}`
	pill.textContent = st === 'running' ? `Running · port ${s.settings.port}` : st === 'error' ? 'Not running' : st === 'starting' ? 'Starting…' : 'Stopped'

	const running = st === 'running'
	for (const id of ['open-village', 'open-clean', 'open-demo']) $(id).disabled = !running
	$('error').hidden = st !== 'error'
	$('error-text').textContent = s.server.error
	$('missing').hidden = s.server.hasVillage

	$('urls').innerHTML = running
		? s.urls
				.map(
					(u) => `<li><span class="lbl" title="${esc(u.label)}">${esc(u.label)}</span>
					<a href="${esc(u.url)}" data-url="${esc(u.url)}">${esc(u.url)}</a>
					<button class="small" data-copy="${esc(u.url)}">Copy</button></li>`,
				)
				.join('')
		: '<li class="none">Not running</li>'

	const ifaces = [
		{ value: '0.0.0.0', label: 'All networks' },
		...s.interfaces.map((i) => ({ value: i.address, label: i.address === '127.0.0.1' ? 'This computer only (127.0.0.1)' : `${i.name} (${i.address})` })),
	]
	// keep a saved interface in the list even while it's unplugged
	if (!ifaces.some((i) => i.value === s.settings.bind)) ifaces.push({ value: s.settings.bind, label: `${s.settings.bind} (not connected)` })
	fillSelect($('bind'), ifaces, s.settings.bind)
	fillSelect($('browser'), s.browsers.map((b) => ({ value: b.key, label: b.label })), s.settings.browser)

	if (document.activeElement !== $('port')) $('port').value = s.settings.port
	if (document.activeElement !== $('query')) $('query').value = s.settings.query
	for (const k of ['openOnLaunch', 'startMinimized', 'runAtLogin']) $(k).checked = s.settings[k]
	$('tray-word').textContent = s.platform === 'darwin' ? 'menu bar' : 'tray'
}

async function set(patch) {
	render(await api.set(patch))
}

$('open-village').onclick = () => api.open('village')
$('open-clean').onclick = () => api.open('clean')
$('open-demo').onclick = () => api.open('demo')
$('retry').onclick = async () => render(await api.restart())
$('hide').onclick = () => api.hide()
$('quit').onclick = () => api.quit()

$('urls').addEventListener('click', (e) => {
	const copy = e.target.closest('[data-copy]')
	if (copy) {
		api.copy(copy.dataset.copy)
		toast('Address copied')
		return
	}
	const link = e.target.closest('[data-url]')
	if (link) {
		e.preventDefault()
		api.openUrl(link.dataset.url)
	}
})

$('bind').onchange = (e) => set({ bind: e.target.value })
$('browser').onchange = (e) => set({ browser: e.target.value })
for (const k of ['openOnLaunch', 'startMinimized', 'runAtLogin']) $(k).onchange = (e) => set({ [k]: e.target.checked })

function commitPort() {
	const port = Number($('port').value)
	if (!current || port === current.settings.port) return
	if (!(port >= 1024 && port <= 65535)) {
		toast('Pick a port from 1024 to 65535')
		$('port').value = current.settings.port
		return
	}
	set({ port })
}
$('port').onchange = commitPort
$('port').onkeydown = (e) => e.key === 'Enter' && $('port').blur()

$('query').onchange = (e) => set({ query: e.target.value })
$('query').onkeydown = (e) => e.key === 'Enter' && $('query').blur()

api.onState(render)
api.state().then(render)
// network cables come and go during load-in: keep the address list fresh
setInterval(() => {
	if (!document.hidden) api.state().then(render)
}, 4000)
