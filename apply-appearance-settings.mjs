#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const kitDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(process.argv[2] || process.cwd())

function fail(message) {
  console.error(`Appearance settings: ${message}`)
  process.exit(1)
}

function readRelative(relativePath) {
  const file = path.join(repoRoot, relativePath)
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`Required file not found: ${relativePath}`)
  return fs.readFileSync(file, 'utf8')
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1
  if (count !== 1) fail(`${label}: expected one matching source anchor; found ${count}. No files have been written.`)
  return source.replace(before, after)
}

function appendOnce(source, marker, addition, label) {
  if (source.includes(marker)) return source
  return `${source.trimEnd()}\n\n${addition.trim()}\n`
}

const sharedAppearance = path.join(kitDir, 'lib', 'appearance.ts')
const appearanceComponent = path.join(kitDir, 'components', 'appearance-settings.tsx')
const newFiles = [
  { from: sharedAppearance, to: 'lib/appearance.ts' },
  { from: appearanceComponent, to: 'components/appearance-settings.tsx' },
]
for (const file of newFiles) {
  if (!fs.existsSync(file.from)) fail(`Kit file is missing: ${path.relative(kitDir, file.from)}`)
  const destination = path.join(repoRoot, file.to)
  if (fs.existsSync(destination)) {
    const incoming = fs.readFileSync(file.from, 'utf8')
    const existing = fs.readFileSync(destination, 'utf8')
    if (incoming !== existing) fail(`${file.to} already exists with different contents. Back it up or merge it manually; no files have been written.`)
  }
}

const updates = new Map()

// 1. Extend the existing preferences JSON shape (no DB migration/table needed).
{
  const file = 'db/schema.ts'
  let source = readRelative(file)
  const before = `export type UserPreferences = {\n  notificationsMuted?: boolean\n  blockedUserIds?: string[]\n}`
  const after = `export type UserPreferences = {\n  notificationsMuted?: boolean\n  blockedUserIds?: string[]\n  fontFamily?: 'noto-kufi-arabic' | 'reem-kufi' | 'amiri' | 'el-messiri' | 'cairo' | 'tajawal' | 'ibm-plex-sans-arabic' | 'noto-sans-arabic'\n  fontSize?: number\n  cardSize?: 'small' | 'medium' | 'large'\n}`
  if (!source.includes('fontFamily?:')) source = replaceExactlyOnce(source, before, after, file)
  updates.set(file, source)
}

// 2. Append an authenticated server action that merges, rather than replaces, preferences.
{
  const file = 'app/account/actions.ts'
  let source = readRelative(file)
  if (!source.includes("from '@/lib/appearance'")) {
    source = replaceExactlyOnce(source, "import { getCurrentUser } from '@/lib/auth'", "import { getCurrentUser } from '@/lib/auth'\nimport { isAppearanceFontFamily, normalizeCardSize, normalizeFontSize } from '@/lib/appearance'", file)
  }
  if (!source.includes('export async function saveAppearanceAction(')) {
    const addition = `\n\nexport async function saveAppearanceAction(input: {\n  fontFamily: import('@/lib/appearance').AppearanceFontFamily\n  fontSize: number\n  cardSize: import('@/lib/appearance').CardSize\n}) {\n  const user = await getCurrentUser()\n  if (!user || !user.isActive) throw new Error('UNAUTHORIZED')\n\n  if (\n    !input ||\n    !isAppearanceFontFamily(input.fontFamily) ||\n    normalizeFontSize(input.fontSize) !== input.fontSize ||\n    normalizeCardSize(input.cardSize) !== input.cardSize\n  ) throw new Error('INVALID_APPEARANCE_PREFERENCES')\n\n  await requireDb().update(users).set({\n    preferences: {\n      ...(user.preferences ?? {}),\n      fontFamily: input.fontFamily,\n      fontSize: input.fontSize,\n      cardSize: input.cardSize,\n    },\n    updatedAt: new Date(),\n  }).where(eq(users.id, user.id))\n\n  revalidatePath('/account')\n  revalidatePath('/', 'layout')\n}`
    source = `${source.trimEnd()}${addition}\n`
  }
  updates.set(file, source)
}

// 3. Render the settings panel on the existing account page.
{
  const file = 'app/account/page.tsx'
  let source = readRelative(file)
  if (!source.includes("from '@/components/appearance-settings'")) {
    source = replaceExactlyOnce(
      source,
      "import Link from 'next/link'",
      "import Link from 'next/link'\nimport { AppearanceSettings } from '@/components/appearance-settings'",
      file,
    )
  }
  if (!source.includes('<AppearanceSettings')) {
    const anchor = `    </section>\n  </div>\n}`
    const addition = `    </section>\n\n    <AppearanceSettings\n      initialFontFamily={user.preferences?.fontFamily}\n      initialFontSize={user.preferences?.fontSize}\n      initialCardSize={user.preferences?.cardSize}\n    />\n  </div>\n}`
    source = replaceExactlyOnce(source, anchor, addition, file)
  }
  updates.set(file, source)
}

// 4. Pass saved preferences into the existing client app shell.
{
  const file = 'components/app-shell.tsx'
  let source = readRelative(file)
  if (!source.includes("from '@/lib/appearance'")) {
    source = replaceExactlyOnce(
      source,
      "import { useEffect, useState } from 'react'",
      "import { useEffect, useState } from 'react'\nimport type { CSSProperties } from 'react'\nimport { APPEARANCE_FONTS, DEFAULT_APPEARANCE, normalizeCardSize, normalizeFontSize } from '@/lib/appearance'",
      file,
    )
  }
  const originalRoot = `  const currentTheme = themes.find(item => item.id === theme) ?? themes[0]\n  const ThemeIcon = currentTheme.icon\n  return <div className="app-root" dir={isEn ? 'ltr' : 'rtl'}>`
  const revisedRoot = `  const currentTheme = themes.find(item => item.id === theme) ?? themes[0]\n  const ThemeIcon = currentTheme.icon\n  const preferredFont = APPEARANCE_FONTS.find(option => option.id === currentUser?.preferences?.fontFamily) ?? APPEARANCE_FONTS.find(option => option.id === DEFAULT_APPEARANCE.fontFamily)!\n  const preferredFontSize = normalizeFontSize(currentUser?.preferences?.fontSize)\n  const preferredCardSize = normalizeCardSize(currentUser?.preferences?.cardSize)\n  const appStyle = { '--portal-font-family': preferredFont.cssFamily, '--user-font-scale': String(preferredFontSize / 16) } as CSSProperties\n  return <div className="app-root" dir={isEn ? 'ltr' : 'rtl'} style={appStyle} data-card-size={preferredCardSize}>`
  if (!source.includes('data-card-size={preferredCardSize}')) source = replaceExactlyOnce(source, originalRoot, revisedRoot, file)
  updates.set(file, source)
}

const expandedGoogleFonts = "@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;500;600;700;800&family=El+Messiri:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&family=Noto+Kufi+Arabic:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&family=Reem+Kufi:wght@400;700&family=Tajawal:wght@400;500;600;700;800&display=swap');"
const scaleFontSizes = source => {
  const sized = source.replace(/font-size(\s*:\s*)(\d+(?:\.\d+)?px)\b/g, (_match, colon, size) => `font-size${colon}calc(${size} * var(--user-font-scale, 1))`)
  return sized.replace(/font(\s*:\s*)((?:(?:normal|italic|oblique|bold|bolder|lighter|[1-9]00)\s+)*)(\d+(?:\.\d+)?px)(?=\s*(?:\/[^\s;]+)?\s+['\"]?[-\w])/g, (_match, colon, weight, size) => `font${colon}${weight}calc(${size} * var(--user-font-scale, 1))`)
}

// 5. Load actual Google Font families and scale the project's existing typography declarations.
{
  const file = 'app/globals.css'
  let source = readRelative(file)
  const firstImport = source.match(/^@import url\([^\n]+\);/)
  if (!firstImport) fail(`${file}: expected the existing Google Fonts import at the top. No files have been written.`)
  if (!source.includes("family=IBM+Plex+Sans+Arabic")) source = source.replace(firstImport[0], expandedGoogleFonts)
  source = scaleFontSizes(source)
  updates.set(file, source)
}

// 6. Appearance controls and density styles. Typography scales preserve the existing visual hierarchy.
{
  const file = 'app/redesign.css'
  let source = readRelative(file)
  const marker = '/* Account appearance personalization */'
  const addition = `${marker}\n.app-root { font-family: var(--portal-font-family, 'IBM Plex Sans Arabic', 'Cairo', sans-serif); }\n.app-root *:not(svg):not(code):not(pre):not(kbd):not(samp):not(.appearance-font-sample) { font-family: var(--portal-font-family, 'IBM Plex Sans Arabic', 'Cairo', sans-serif) !important; }\n.app-root :is(code, pre, kbd, samp) { font-family: ui-monospace, SFMono-Regular, Consolas, monospace !important; }\n.appearance-preview { --portal-font-family: 'IBM Plex Sans Arabic', sans-serif; --user-font-scale: 1; --user-card-scale: 1; border: 1px solid var(--line); border-radius: 16px; padding: 14px; background: var(--surface-strong); font-family: var(--portal-font-family); }\n.app-root[data-card-size="small"], .appearance-preview[data-card-size="small"] { --user-card-scale: .82; }\n.app-root[data-card-size="medium"], .appearance-preview[data-card-size="medium"] { --user-card-scale: 1; }\n.app-root[data-card-size="large"], .appearance-preview[data-card-size="large"] { --user-card-scale: 1.18; }\n.app-root[data-card-size] :is(.card, .page-card, .feature-card, .chart-card, .schedule-card, .today-card, .activity-card, .account-profile-card, .account-edit, .account-settings, .security-card, .announcement-card, .community-card), .appearance-preview[data-card-size] :is(.card, .page-card, .feature-card, .chart-card, .schedule-card, .today-card, .activity-card, .account-profile-card, .account-edit, .account-settings, .security-card, .announcement-card, .community-card) { padding: calc(20px * var(--user-card-scale, 1)) !important; }\n.app-root[data-card-size] .stat-card, .appearance-preview[data-card-size] .stat-card { padding: calc(13px * var(--user-card-scale, 1)) !important; }\n.app-root[data-card-size] .quick-link, .appearance-preview[data-card-size] .quick-link { padding: calc(14px * var(--user-card-scale, 1)) !important; }\n.app-root[data-card-size] .account-setting-row, .appearance-preview[data-card-size] .account-setting-row { padding-block: calc(13px * var(--user-card-scale, 1)) !important; }\n.appearance-settings { display: grid; gap: 20px; }\n.appearance-settings > .section-header { margin-bottom: 0; }\n.appearance-control-block { display: grid; gap: 12px; padding-top: 17px; border-top: 1px solid var(--line); }\n.appearance-control-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }\n.appearance-control-heading h3 { margin: 0; font-size: 13px; }\n.appearance-control-heading p { margin: 4px 0 0; color: var(--muted); font-size: 10px; line-height: 1.7; }\n.appearance-current-font, .appearance-size-value { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--text-soft); padding: 6px 9px; font-size: 9px; white-space: nowrap; }\n.appearance-font-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }\n.appearance-font-option { display: grid; align-content: start; gap: 9px; min-width: 0; min-height: 112px; padding: 12px; text-align: start; color: var(--text); background: var(--surface); border: 1px solid var(--line); border-radius: 13px; cursor: pointer; transition: border-color .16s ease, background .16s ease; }\n.appearance-font-option:hover { border-color: color-mix(in srgb, var(--primary) 55%, var(--line)); }\n.appearance-font-option.active, .appearance-card-size-option.active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 7%, var(--surface)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 13%, transparent); }\n.appearance-font-option-head { display: flex; align-items: center; justify-content: space-between; gap: 7px; color: var(--text); }\n.appearance-font-option-head strong { font-size: 10px; overflow-wrap: anywhere; }\n.appearance-font-option-head svg { flex: none; color: var(--primary); }\n.appearance-font-sample { display: block; color: var(--text); font-size: 19px; line-height: 1.8; overflow-wrap: anywhere; }\n.appearance-font-description { color: var(--muted); font-size: 9px; line-height: 1.6; }\n.appearance-range-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 28px; align-items: center; gap: 11px; color: var(--muted); font-size: 10px; }\n.appearance-range-row input { width: 100%; accent-color: var(--primary); cursor: pointer; }\n.appearance-card-size-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }\n.appearance-card-size-option { display: grid; justify-items: start; gap: 6px; min-width: 0; padding: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 13px; text-align: start; color: var(--text); cursor: pointer; }\n.appearance-card-size-option strong { font-size: 10px; }\n.appearance-card-size-option small { color: var(--muted); font-size: 9px; }\n.appearance-density-glyph { display: grid; gap: 3px; width: 34px; padding: 5px; border: 1px solid var(--line); border-radius: 6px; }\n.appearance-density-glyph i { display: block; height: 3px; border-radius: 3px; background: var(--primary); }\n.density-small { gap: 2px; padding: 4px; }\n.density-large { gap: 4px; padding: 6px; }\n.appearance-preview { display: grid; gap: 10px; }\n.appearance-preview-card { min-width: 0; display: grid; gap: 9px; }\n.appearance-preview-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--muted); font-size: 10px; }\n.appearance-preview-card-head strong { color: var(--primary); font-size: 14px; }\n.appearance-preview-arabic { margin: 0; color: var(--text); font-size: 22px; line-height: 1.85; overflow-wrap: anywhere; }\n.appearance-preview-copy { margin: 0; color: var(--muted); font-size: 10px; line-height: 1.8; }\n.appearance-preview-mini-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }\n.appearance-preview-mini { display: grid; gap: 7px; min-width: 0; }\n.appearance-preview-mini span { color: var(--muted); font-size: 9px; }\n.appearance-preview-mini strong { font-size: 16px; color: var(--text); }\n.appearance-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }\n.appearance-actions .button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }\n.appearance-reset-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }\n.appearance-actions :is(button[disabled]) { opacity: .65; cursor: wait; }\n.appearance-save-status { flex-basis: 100%; min-height: 18px; color: var(--muted); font-size: 10px; }\n.appearance-save-status.success { color: #24885c; }\n.appearance-save-status.error { color: #d14f4f; }\nhtml[data-theme="dark"] .appearance-font-option, html[data-theme="dark"] .appearance-card-size-option { background: var(--surface); }\nhtml[data-theme="amoled"] .appearance-font-option, html[data-theme="amoled"] .appearance-card-size-option { background: #050505; }\n@media (min-width: 900px) { .appearance-font-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }\n@media (max-width: 520px) { .appearance-font-grid { grid-template-columns: 1fr; } .appearance-card-size-options { gap: 6px; } .appearance-card-size-option { padding: 9px; } .appearance-current-font { max-width: 46%; white-space: normal; overflow-wrap: anywhere; } .appearance-preview-mini-grid { gap: 7px; } }`
  if (!source.includes(marker)) source = `${source.trimEnd()}\n\n${addition}\n`
  source = scaleFontSizes(source)
  updates.set(file, source)
}

// All source anchors have been validated before this point. Back up and then write as one prepared set.
const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'school-appearance-settings-'))
for (const relativePath of updates.keys()) {
  const current = path.join(repoRoot, relativePath)
  const backup = path.join(backupRoot, relativePath)
  fs.mkdirSync(path.dirname(backup), { recursive: true })
  fs.copyFileSync(current, backup)
}
for (const [relativePath, content] of updates) {
  const target = path.join(repoRoot, relativePath)
  fs.writeFileSync(target, content, 'utf8')
}
for (const file of newFiles) {
  const destination = path.join(repoRoot, file.to)
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(file.from, destination)
  }
}

console.log('Appearance settings applied.')
console.log(`Updated ${updates.size} existing files and installed ${newFiles.length} new files.`)
console.log(`Backups: ${backupRoot}`)
console.log('Next: inspect git diff, run npm run build, then commit and push.')
