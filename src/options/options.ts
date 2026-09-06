import { loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from '../core/settings.js'

const LIST_KEYS = new Set(['excludePatterns', 'excludeSelectors'])

async function paint(settings: Settings): Promise<void> {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-key]'))) {
    const key = el.dataset.key as keyof Settings
    const value = settings[key]
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value)
    else if (el instanceof HTMLTextAreaElement) el.value = (value as string[]).join('\n')
    else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = String(value)
  }
  for (const el of Array.from(document.querySelectorAll<HTMLInputElement>('[data-color]'))) {
    el.value = settings.colors[el.dataset.color as keyof Settings['colors']]
  }
}

function flash(): void {
  const el = document.getElementById('saved')!
  el.textContent = 'Saved'
  setTimeout(() => (el.textContent = ''), 1200)
}

async function onChange(target: HTMLElement): Promise<void> {
  if (target.dataset.color) {
    const current = await loadSettings()
    await saveSettings({
      colors: { ...current.colors, [target.dataset.color]: (target as HTMLInputElement).value },
    })
    flash()
    return
  }
  const key = target.dataset.key as keyof Settings | undefined
  if (!key) return

  let value: unknown
  if (target instanceof HTMLInputElement && target.type === 'checkbox') value = target.checked
  else if (target instanceof HTMLInputElement && target.type === 'number') value = Number(target.value)
  else if (target instanceof HTMLTextAreaElement && LIST_KEYS.has(key)) {
    value = target.value.split('\n').map((v) => v.trim()).filter(Boolean)
  } else value = (target as HTMLInputElement | HTMLSelectElement).value

  await saveSettings({ [key]: value } as Partial<Settings>)
  flash()
}

document.addEventListener('change', (e) => void onChange(e.target as HTMLElement))
document.getElementById('reset-panel')!.addEventListener('click', async () => {
  await saveSettings({ panelPos: null, panelCorner: DEFAULT_SETTINGS.panelCorner })
  await paint(await loadSettings())
  flash()
})
document.getElementById('reset')!.addEventListener('click', async () => {
  await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS })
  await paint(DEFAULT_SETTINGS)
  flash()
})

void loadSettings().then(paint)
