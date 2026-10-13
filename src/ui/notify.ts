// DOM-only notifications so game modules can announce things without importing the HUD

let tickerEl: HTMLElement | null = null
let bannerEl: HTMLElement | null = null
let bannerTimer = 0
const bannerQueue: { t: string; s: string; cls: string }[] = []
let muted = false

/** Silence banners (used while fast-forwarding) */
export function muteBanners(m: boolean) {
	muted = m
}

export function initNotify() {
	tickerEl = document.getElementById('ticker')
	bannerEl = document.getElementById('banner')
}

export function ticker(msg: string, icon: string, color?: string) {
	if (!tickerEl) return
	const d = document.createElement('div')
	const ic = document.createElement('span')
	ic.className = 'ic'
	ic.textContent = icon + ' '
	if (color) ic.style.color = color
	d.append(ic, document.createTextNode(msg))
	tickerEl.prepend(d)
	while (tickerEl.children.length > 5) tickerEl.lastChild!.remove()
	Array.from(tickerEl.children).forEach((c, i) => ((c as HTMLElement).style.opacity = String(1 - i * 0.17)))
}

export function clearTicker() {
	if (tickerEl) tickerEl.innerHTML = ''
}

/** Big centred announcement. Queued so a burst of news is shown one after another. */
export function banner(t: string, s = '', cls = '') {
	if (muted) return
	bannerQueue.push({ t, s, cls })
	// during a burst (catch-up after the page was closed) only keep the latest few
	while (bannerQueue.length > 4) bannerQueue.shift()
	if (!bannerTimer) showNextBanner()
}

function showNextBanner() {
	const next = bannerQueue.shift()
	if (!bannerEl || !next) {
		bannerTimer = 0
		bannerEl?.classList.remove('show')
		return
	}
	bannerEl.className = 'panel show ' + next.cls
	bannerEl.querySelector('.t')!.textContent = next.t
	bannerEl.querySelector('.s')!.textContent = next.s
	bannerTimer = window.setTimeout(() => {
		bannerEl!.classList.remove('show')
		bannerTimer = window.setTimeout(showNextBanner, 500)
	}, bannerQueue.length > 2 ? 2600 : 4600)
}
