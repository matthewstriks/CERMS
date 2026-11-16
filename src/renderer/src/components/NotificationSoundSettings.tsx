import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { useNotificationSounds } from '../lib/notification-sounds'
import { useMembershipSession } from '../lib/membership-session'
import { notificationAudio } from '../lib/notification-audio'
export default function NotificationSoundSettings() {
  const { preference, saving, save } = useNotificationSounds(),
    { reader, switching } = useMembershipSession()
  const [enabled, setEnabled] = useState(preference.enabled),
    [volume, setVolume] = useState(preference.volume)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [testing, setTesting] = useState(false)
  useEffect(() => {
    setEnabled(preference.enabled)
    setVolume(preference.volume)
    setError('')
  }, [reader?.uid, preference.enabled, preference.volume])
  useEffect(() => setNotice(''), [reader?.uid])
  const dirty = enabled !== preference.enabled || volume !== preference.volume
  return (
    <section
      className="panel settings-card notification-sound-settings"
      aria-label="Notification sounds"
    >
      <h2>
        <Volume2 size={19} aria-hidden="true" />
        Notification sounds
      </h2>
      <p>
        Play a chime for incoming staff messages, popup warnings, errors, and app notifications.
        Saved to your account across businesses and devices.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setError('')
          setNotice('')
          try {
            await save({ enabled, volume })
            setNotice('Sound preferences saved.')
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Sound preferences could not be saved.')
          }
        }}
      >
        <fieldset disabled={saving || switching}>
          <label className="sound-enable">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked)
                setNotice('')
              }}
            />
            Enable notification sounds
          </label>
          <label className="sound-volume">
            Volume <output>{volume}%</output>
            <input
              aria-label="Notification volume"
              type="range"
              min="0"
              max="100"
              step="1"
              value={volume}
              onChange={(e) => {
                setVolume(e.target.valueAsNumber)
                setNotice('')
              }}
            />
          </label>
          <p className="muted">
            Test uses the selected volume even when alerts are disabled. Your device volume also
            affects playback.
          </p>
          <div className="sound-actions">
            <button
              type="button"
              disabled={testing || volume === 0}
              onClick={async () => {
                setTesting(true)
                setError('')
                setNotice('')
                const played = await notificationAudio.play(volume, true)
                if (played) setNotice(`Test sound played at ${volume}%.`)
                else
                  setError(
                    'Audio could not play. Check your audio output and try Test sound again.',
                  )
                setTesting(false)
              }}
            >
              {testing ? 'Testing…' : 'Test sound'}
            </button>
            <button type="submit" className="primary" disabled={!dirty}>
              {saving ? 'Saving…' : 'Save sound preferences'}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setEnabled(preference.enabled)
                  setVolume(preference.volume)
                  setError('')
                  setNotice('')
                }}
              >
                Cancel changes
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {volume === 0 && <p>Volume is zero; sounds are silent.</p>}
      {dirty && <p>Unsaved changes. Test previews them; Save applies them to alerts.</p>}
      {notice && (
        <p role="status" aria-label="Sound preference status">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </section>
  )
}
