/**
 * SETTINGS — one screen, no maze (spec §12).
 *
 * Everything that can be changed is here, at full size, with a plain sentence
 * saying what it does. Backup, restore and the "get the Record icon on your
 * home screen" instructions live here too, because that is the one piece of
 * setup this app needs and it is not discoverable on its own.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useRouter } from '../lib/router.jsx'
import { backupFilename, serializeBackup } from '../lib/backup.js'
import { allAsText, copyText, downloadFile, shareFile } from '../lib/text.js'
import { bytes, plural } from '../lib/format.js'
import { estimateStorage } from '../lib/db.js'
import { TRANSCRIBERS, speechSupported } from '../lib/transcribe.js'
import { recorderSupported } from '../lib/recorder.js'
import Icon from '../components/Icon.jsx'
import Button, { Segmented, ToggleRow } from '../components/Button.jsx'
import { Screen, ScreenHeader, ScreenBody } from '../components/Screen.jsx'
import Sheet, { ConfirmSheet } from '../components/Sheet.jsx'
import { StampLabel } from '../components/Stamp.jsx'
import MicPanel from '../components/MicPanel.jsx'
import { APP_VERSION } from '../version.js'

export default function Settings() {
  const {
    settings,
    setSetting,
    notes,
    buckets,
    notesByBucket,
    exportData,
    importData,
    eraseEverything,
    showToast,
  } = useStore()
  const { navigate } = useRouter()

  const [storage, setStorage] = useState(null)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreFile, setRestoreFile] = useState(null)
  const [confirmErase, setConfirmErase] = useState(false)
  const [howToOpen, setHowToOpen] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    estimateStorage().then(setStorage)
    setInstalled(window.matchMedia?.('(display-mode: standalone)')?.matches || false)

    const onPrompt = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const stats = useMemo(() => {
    const withAudio = notes.filter((n) => n.audioBlobId).length
    return { total: notes.length, withAudio, buckets: buckets.length }
  }, [notes, buckets])

  const engines = useMemo(
    () => Object.values(TRANSCRIBERS).filter((t) => t.isSupported()),
    []
  )

  /* -------------------------------------------------------------- backup */

  const makeBackupFile = () => {
    const json = serializeBackup(exportData())
    return new File([json], backupFilename(), { type: 'application/json' })
  }

  const onShareBackup = async () => {
    const file = makeBackupFile()
    const result = await shareFile(file, {
      title: 'Quick Notes backup',
      text: 'My Quick Notes backup.',
    })
    if (result === 'downloaded') showToast('Saved to your downloads', { tone: 'good', ms: 2600 })
    else if (result === 'shared') showToast('Sent', { tone: 'good', ms: 1800 })
    else if (result === 'failed') showToast('Could not share the backup')
  }

  const onSaveBackup = () => {
    const file = makeBackupFile()
    const ok = downloadFile(file, file.name)
    showToast(ok ? `Saved ${file.name}` : 'Could not save the file', {
      tone: ok ? 'good' : undefined,
      ms: 3000,
    })
  }

  const onPickRestore = () => fileRef.current?.click()

  const onFileChosen = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      setRestoreFile({ name: file.name, text })
      setRestoreOpen(true)
    } catch {
      showToast('Could not read that file')
    }
  }

  const runRestore = async (mode) => {
    setRestoreOpen(false)
    try {
      const result = await importData(restoreFile.text, mode)
      showToast(
        mode === 'replace'
          ? `Restored ${plural(result.total, 'note')}`
          : `Added ${plural(result.added, 'note')}`,
        { tone: 'good', ms: 3200 }
      )
    } catch (err) {
      showToast(err?.message || 'That file could not be restored', { ms: 4000 })
    } finally {
      setRestoreFile(null)
    }
  }

  /* -------------------------------------------------------------- render */

  return (
    <Screen>
      <ScreenHeader title="Settings" subtitle="Everything, on one screen" />
      <ScreenBody>
        <div className="space-y-7">
          {/* ---------------------------------------------------- look */}
          <Section title="Look">
            <Segmented
              value={settings.theme}
              onChange={(v) => setSetting('theme', v)}
              options={[
                { value: 'dark', label: 'Dark', icon: 'moon' },
                { value: 'sepia', label: 'Paper', icon: 'sun' },
              ]}
            />
            <div>
              <Label>Text size</Label>
              <Segmented
                value={settings.textScale}
                onChange={(v) => setSetting('textScale', v)}
                options={[
                  { value: '1', label: 'Normal' },
                  { value: '1.12', label: 'Large' },
                  { value: '1.25', label: 'Largest' },
                ]}
              />
            </div>
          </Section>

          {/* -------------------------------------------------- recording */}
          <Section title="Recording">
            <div>
              <Label>Keep the voice recording</Label>
              <Segmented
                value={settings.audioRetention}
                onChange={(v) => setSetting('audioRetention', v)}
                options={[
                  { value: 'until-filed', label: 'Until filed' },
                  { value: 'always', label: 'Always' },
                  { value: 'ask', label: 'Ask me' },
                ]}
              />
              <Hint>
                {settings.audioRetention === 'until-filed' &&
                  'Recordings stay attached until you file the note, so you can check the words against your voice. Then only the text is kept.'}
                {settings.audioRetention === 'always' &&
                  'Every recording is kept for good. Uses more space on the phone.'}
                {settings.audioRetention === 'ask' &&
                  'You are asked each time you file a note with a recording.'}
              </Hint>
              <Hint>A recording is never deleted if the note has no text.</Hint>
            </div>

            <ToggleRow
              icon="text"
              label="Write down what I say"
              hint={
                settings.speechBlockedReason === 'contention'
                  ? 'This phone cannot do this while recording — checked and confirmed.'
                  : 'Turns speech into text while you record.'
              }
              checked={settings.liveTranscribe}
              onChange={(v) => setSetting('liveTranscribe', v)}
            />
            {settings.speechBlockedReason === 'contention' && (
              <Hint>
                The microphone check found this phone will not let the recorder and the speech
                service run together, so this was switched off to stop it failing on every
                recording. Your voice is still saved with every note. You can turn it back on to
                try again after a phone update.
              </Hint>
            )}

            {engines.length > 1 && settings.liveTranscribe && (
              <div>
                <Label>Speech engine</Label>
                <Segmented
                  value={settings.transcriber}
                  onChange={(v) => setSetting('transcriber', v)}
                  options={engines.map((e) => ({ value: e.id, label: e.label }))}
                />
              </div>
            )}

            <ToggleRow
              icon="eye"
              label="Keep the screen on while recording"
              hint="Stops the screen turning off and cutting a recording short."
              checked={settings.keepAwake}
              onChange={(v) => setSetting('keepAwake', v)}
            />

            <ToggleRow
              icon="check"
              label="Offer to split lists"
              hint='"Milk, bread and eggs" can become three items when you file it to a checklist.'
              checked={settings.splitOnFile}
              onChange={(v) => setSetting('splitOnFile', v)}
            />

            <ToggleRow
              icon="vibrate"
              label="Buzz when something happens"
              checked={settings.haptics}
              onChange={(v) => setSetting('haptics', v)}
            />

          </Section>

          {/* ------------------------------------------------ microphone */}
          <Section title="Microphone">
            <MicPanel
              settings={settings}
              onToast={(msg, tone) => showToast(msg, { tone, ms: 2600 })}
              onApplyCombination={async ({
                audioProfile,
                speechFirst,
                speechBlockedReason = null,
                disableLive = false,
              }) => {
                await setSetting('audioProfile', audioProfile)
                await setSetting('speechFirst', speechFirst)
                await setSetting('speechBlockedReason', speechBlockedReason)
                if (disableLive) await setSetting('liveTranscribe', false)
              }}
            />
            <StatusRow
              ok={recorderSupported()}
              label="Recording"
              value={
                recorderSupported()
                  ? 'Supported by this browser'
                  : 'Not available in this browser — try Chrome'
              }
            />
            <StatusRow
              ok={speechSupported()}
              label="Speech to text"
              value={
                speechSupported()
                  ? 'The browser offers it — use the check above to see if it works here'
                  : 'Not available — your voice still records'
              }
            />
          </Section>

          {/* ------------------------------------------------ home screen */}
          <Section title="On your home screen">
            {!installed && installPrompt && (
              <Button
                variant="primary"
                full
                icon="install"
                onClick={async () => {
                  installPrompt.prompt()
                  const choice = await installPrompt.userChoice.catch(() => null)
                  if (choice?.outcome === 'accepted') setInstalled(true)
                  setInstallPrompt(null)
                }}
              >
                Install Quick Notes
              </Button>
            )}
            {installed && (
              <StatusRow ok label="Installed" value="Running from your home screen" />
            )}
            <Button variant="quiet" full icon="mic" onClick={() => setHowToOpen(true)}>
              Get the Record button on your home screen
            </Button>
            <Button variant="quiet" full icon="mic" onClick={() => navigate('record')}>
              Record a note now
            </Button>
          </Section>

          {/* ---------------------------------------------------- backup */}
          <Section title="Backup">
            <Hint>
              Everything lives on this phone only. A backup is a plain readable file you can open,
              email to yourself, and use to put it all back.
            </Hint>
            <Button variant="primary" full icon="share" onClick={onShareBackup}>
              Email a backup to myself
            </Button>
            <Button variant="solid" full icon="download" onClick={onSaveBackup}>
              Save the backup file
            </Button>
            <Button
              variant="solid"
              full
              icon="copy"
              onClick={async () => {
                const ok = await copyText(allAsText(buckets, notesByBucket))
                showToast(ok ? 'All notes copied as text' : 'Could not copy', {
                  tone: ok ? 'good' : undefined,
                })
              }}
            >
              Copy everything as text
            </Button>
            <Button variant="quiet" full icon="upload" onClick={onPickRestore}>
              Restore from a backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={onFileChosen}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
          </Section>

          {/* ---------------------------------------------------- about */}
          <Section title="This app">
            <div className="paper space-y-1.5 rounded-xl px-4 py-3 text-[0.88rem] text-muted">
              <Row label="Notes" value={String(stats.total)} />
              <Row label="Recordings kept" value={String(stats.withAudio)} />
              <Row label="Buckets" value={String(stats.buckets)} />
              {storage && <Row label="Space used" value={bytes(storage.usage)} />}
              <Row label="Version" value={APP_VERSION} />
            </div>
            <Hint>
              No accounts. No adverts. Nothing is sent anywhere. Free, always.
            </Hint>
            <Button
              variant="quiet"
              full
              icon="warning"
              className="text-danger"
              onClick={() => setConfirmErase(true)}
            >
              Erase everything
            </Button>
          </Section>
        </div>
      </ScreenBody>

      {/* ------------------------------------------------------- sheets */}

      <Sheet
        open={howToOpen}
        onClose={() => setHowToOpen(false)}
        title="Two icons, one job each"
        subtitle="The Record icon starts recording the moment you tap it."
      >
        <ol className="space-y-3 py-2 pb-5">
          {[
            'Install Quick Notes to your home screen first (Chrome menu → Add to Home screen).',
            'Press and hold the Quick Notes icon on your home screen.',
            'A small "Record" shortcut appears above it.',
            'Drag that Record shortcut onto an empty spot on your home screen.',
            'Done. Tapping it goes straight to recording — you can talk in about two seconds.',
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="stamp-label flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-accent text-[0.8rem] text-accent">
                {i + 1}
              </span>
              <span className="pt-1 text-[0.98rem] leading-relaxed text-ink">{step}</span>
            </li>
          ))}
        </ol>
      </Sheet>

      <Sheet
        open={restoreOpen}
        onClose={() => {
          setRestoreOpen(false)
          setRestoreFile(null)
        }}
        title="Restore this backup?"
        subtitle={restoreFile?.name}
      >
        <div className="space-y-2.5 py-1 pb-4">
          <Button variant="primary" full icon="plus" onClick={() => runRestore('merge')}>
            Add it to what is here
          </Button>
          <Button variant="danger" full icon="upload" onClick={() => runRestore('replace')}>
            Replace everything
          </Button>
          <Hint>
            "Add" keeps your current notes and brings in anything missing. "Replace" wipes this
            phone first — including recordings, which backups do not contain.
          </Hint>
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmErase}
        onClose={() => setConfirmErase(false)}
        title="Erase everything?"
        message="Every note, recording and bucket on this phone is deleted for good. Save a backup first if you might want any of it."
        confirmLabel="Yes, erase it all"
        cancelLabel="No, keep my notes"
        tone="danger"
        onConfirm={async () => {
          await eraseEverything()
          showToast('Everything erased', { ms: 2600 })
          navigate('inbox')
        }}
      />
    </Screen>
  )
}

/* ------------------------------------------------------------------------ */

function Section({ title, children }) {
  return (
    <section>
      <StampLabel className="mb-2.5 px-1">{title}</StampLabel>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function Label({ children }) {
  return <div className="mb-2 px-1 text-[0.85rem] text-muted">{children}</div>
}

function Hint({ children }) {
  return <p className="px-1 text-[0.82rem] leading-relaxed text-muted">{children}</p>
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span>{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  )
}

function StatusRow({ ok, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface2 px-4 py-3">
      <Icon
        name={ok ? 'check' : 'warning'}
        size={20}
        className={ok ? 'shrink-0 text-accent' : 'shrink-0 text-danger'}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[0.92rem] text-ink">{label}</span>
        <span className="block text-[0.8rem] leading-snug text-muted">{value}</span>
      </span>
    </div>
  )
}
