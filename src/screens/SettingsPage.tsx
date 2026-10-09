import { useRef, useState, type ChangeEvent } from 'react'
import { getQuestionByKey } from '../lib/bank'
import { todayStr } from '../lib/date'
import { checkImport, type ImportCheck } from '../lib/importQuestions'
import { exportBackup, parseBackup, type BackupSummary, type AppData, type ThemeSetting } from '../lib/storage'
import { clip } from '../lib/text'
import { APP_VERSION } from '../lib/version'
import { useApp } from '../state/AppState'
import { ConfirmDialog } from '../components/Modal'
import { Segmented } from '../components/Controls'

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })
}

type Message = { kind: 'ok' | 'error'; text: string }

function Msg({ m }: { m: Message | null }) {
  if (!m) return null
  return (
    <p className={`msg ${m.kind === 'ok' ? 'msg-ok' : 'msg-error'}`} role={m.kind === 'error' ? 'alert' : 'status'}>
      {m.text}
    </p>
  )
}

export function SettingsPage() {
  return (
    <div className="stack">
      <h1 className="page-title">設定</h1>
      <BasicSettings />
      <BackupSection />
      <ImportSection />
      <FlagSection />
      <AboutSection />
    </div>
  )
}

// ---- 受検日・問題数・テーマ ----

function BasicSettings() {
  const { data, updateSettings } = useApp()
  const { examDate, drillSize, theme } = data.settings
  return (
    <section className="card" aria-label="基本の設定">
      <h2 className="card-title">基本の設定</h2>

      <div className="field">
        <label className="field-label" htmlFor="exam-date">
          受検日
        </label>
        <div className="row-actions">
          <input
            id="exam-date"
            className="input"
            type="date"
            value={examDate ?? ''}
            onChange={(e) => updateSettings({ examDate: e.target.value || undefined })}
          />
          {examDate && (
            <button type="button" className="btn btn-secondary" onClick={() => updateSettings({ examDate: undefined })}>
              消す
            </button>
          )}
        </div>
        <p className="muted small">設定するとホームに残り日数が出ます。</p>
      </div>

      <div className="field">
        <span className="field-label" id="drill-size-label">
          ドリルの問題数
        </span>
        <Segmented
          label="ドリルの問題数"
          value={drillSize}
          options={[
            { value: 5, label: '5問' },
            { value: 10, label: '10問' },
          ]}
          onChange={(v) => updateSettings({ drillSize: v })}
        />
      </div>

      <div className="field">
        <span className="field-label">表示テーマ</span>
        <Segmented<ThemeSetting>
          label="表示テーマ"
          value={theme}
          options={[
            { value: 'auto', label: '自動' },
            { value: 'light', label: 'ライト' },
            { value: 'dark', label: 'ダーク' },
          ]}
          onChange={(v) => updateSettings({ theme: v })}
        />
        <p className="muted small">「自動」は、スマホの設定（ダークモード）に合わせます。</p>
      </div>
    </section>
  )
}

// ---- 学習記録のバックアップ ----

function BackupSection() {
  const { data, replaceAll } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<Message | null>(null)
  const [pending, setPending] = useState<{ data: AppData; summary: BackupSummary; name: string } | null>(null)

  const doExport = () => {
    downloadText(`spi-trainer-backup-${todayStr()}.json`, exportBackup(data))
    setMsg({ kind: 'ok', text: 'バックアップを書き出しました。ダウンロードしたファイルを大切に保管してください。' })
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg(null)
    try {
      const text = await file.text()
      const r = parseBackup(text)
      if (!r.ok) setMsg({ kind: 'error', text: r.error })
      else setPending({ data: r.data, summary: r.summary, name: file.name })
    } catch {
      setMsg({ kind: 'error', text: 'ファイルを読み取れませんでした。' })
    }
  }

  return (
    <section className="card" aria-label="学習記録のバックアップ">
      <h2 className="card-title">学習記録のバックアップ</h2>
      <p className="muted">
        学習記録はこの端末の中だけに保存されています。機種変更やブラウザのデータ削除に備えて、ときどき書き出しておくと安心です。
      </p>
      <div className="row-actions">
        <button type="button" className="btn btn-secondary" onClick={doExport}>
          書き出す
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
          読み込む
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
      </div>
      <Msg m={msg} />

      <ConfirmDialog
        open={pending !== null}
        title="今の学習記録を上書きしますか？"
        confirmLabel="上書きして読み込む"
        danger
        onConfirm={() => {
          if (pending) {
            replaceAll(pending.data)
            setMsg({ kind: 'ok', text: '学習記録を読み込みました。' })
          }
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      >
        {pending && (
          <>
            <p>
              「{pending.name}」を読み込むと、いま端末にある学習記録は消えて置き換わります。元には戻せません。先に今の記録を書き出しておくと安心です。
            </p>
            <ul className="plain-list">
              <li>
                <span>回答の記録</span>
                <span>{pending.summary.attempts}件</span>
              </li>
              <li>
                <span>復習リスト</span>
                <span>{pending.summary.reviews}件</span>
              </li>
              <li>
                <span>「おかしい」の記録</span>
                <span>{pending.summary.flags}件</span>
              </li>
              <li>
                <span>取り込んだ問題</span>
                <span>{pending.summary.importedQuestions}問</span>
              </li>
            </ul>
            {pending.summary.skipped > 0 && (
              <p className="msg msg-error">形が正しくなく、読み飛ばす記録が{pending.summary.skipped}件あります。</p>
            )}
          </>
        )}
      </ConfirmDialog>
    </section>
  )
}

// ---- 問題の追加 ----

const SAMPLE = `[
  {
    "key": "imp-001",
    "topic": "nv-inference",
    "difficulty": 2,
    "format": "single",
    "stem": "A、B、Cの3人が一列に並んでいる。Aは先頭ではない。",
    "choices": ["Aは最後尾", "Bは先頭", "Cは先頭"],
    "answer": 0,
    "hint": "先頭になれるのは誰かを考えます。",
    "explanation": ["先頭はBかC。", "答え: Aは最後尾"]
  }
]`

function ImportSection() {
  const { data, setImported } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [check, setCheck] = useState<ImportCheck | null>(null)
  const [msg, setMsg] = useState<Message | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setText(await file.text())
      setCheck(null)
      setMsg(null)
    } catch {
      setMsg({ kind: 'error', text: 'ファイルを読み取れませんでした。' })
    }
  }

  const doCheck = () => {
    setMsg(null)
    setCheck(checkImport(text, (key) => getQuestionByKey(key) !== undefined))
  }

  const doImport = () => {
    if (!check || !check.ok) return
    setImported([...data.importedQuestions, ...check.questions])
    setMsg({ kind: 'ok', text: `${check.questions.length}問を取り込みました。` })
    setText('')
    setCheck(null)
  }

  return (
    <section className="card" aria-label="問題の追加">
      <h2 className="card-title">問題の追加</h2>
      <p className="muted">問題のJSONを貼り付けるか、ファイルを選んでください。検査に通った問題だけを取り込めます。</p>

      <textarea
        className="input code-input"
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setCheck(null)
        }}
        placeholder="[ { &quot;key&quot;: &quot;imp-001&quot;, ... } ]"
        aria-label="問題のJSON"
        spellCheck={false}
      />
      <div className="row-actions">
        <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
          ファイルを選ぶ
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json,text/plain" hidden onChange={onFile} />
        <button type="button" className="btn btn-primary" disabled={text.trim() === ''} onClick={doCheck}>
          検査する
        </button>
      </div>

      {check && !check.ok && (
        <div className="msg msg-error" role="alert">
          <p>
            <strong>取り込めません。</strong>直してからもう一度検査してください（1問でもエラーがあると、1問も取り込みません）。
          </p>
          {check.fatal && <p>{check.fatal}</p>}
          {check.problems.length > 0 && (
            <ul className="problem-list">
              {check.problems.map((p) => (
                <li key={p.no}>
                  <strong>
                    {p.no}問目{p.key && `（${p.key}）`}
                  </strong>
                  <ul>
                    {p.messages.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {check && check.ok && (
        <div className="msg msg-ok" role="status">
          <p>
            <strong>{check.questions.length}問、検査に通りました。</strong>
          </p>
          <button type="button" className="btn btn-primary" onClick={doImport}>
            {check.questions.length}問を取り込む
          </button>
        </div>
      )}
      <Msg m={msg} />

      <details className="note-details">
        <summary>JSONの書き方の例</summary>
        <p className="muted small">
          topic は分野ID（例: nv-inference, vb-relation）。format は single（1つ選ぶ）/ multi（全部選ぶ）。answer は選択肢の番号（0から数える。multi は配列）。分数は {'{{3/5}}'}、改行は \n と書きます。
          key は他の問題とかぶらない名前にしてください（例: imp-001）。
        </p>
        <pre className="code-sample">{SAMPLE}</pre>
      </details>

      <div className="imported-row">
        <span>取り込んだ問題: {data.importedQuestions.length}問</span>
        {data.importedQuestions.length > 0 && (
          <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setConfirmClear(true)}>
            全部削除
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="取り込んだ問題を全部削除しますか？"
        confirmLabel="削除する"
        danger
        onConfirm={() => {
          setImported([])
          setConfirmClear(false)
          setMsg({ kind: 'ok', text: '取り込んだ問題を削除しました。' })
        }}
        onCancel={() => setConfirmClear(false)}
      >
        <p>{data.importedQuestions.length}問を削除します。過去の回答の記録は残ります。</p>
      </ConfirmDialog>
    </section>
  )
}

// ---- 「この問題おかしい？」の記録 ----

function FlagSection() {
  const { data, removeFlag } = useApp()
  const flags = [...data.flags].sort((a, b) => b.at.localeCompare(a.at))

  const doExport = () => {
    const items = flags.map((f) => {
      let question
      try {
        question = getQuestionByKey(f.questionKey)
      } catch {
        question = undefined
      }
      return { ...f, question }
    })
    downloadText(`spi-trainer-flags-${todayStr()}.json`, JSON.stringify(items, null, 2))
  }

  return (
    <section className="card" aria-label="おかしい問題の記録">
      <h2 className="card-title">「この問題おかしい？」の記録</h2>
      {flags.length === 0 ? (
        <p className="muted">記録はありません。解説の画面から記録できます。</p>
      ) : (
        <>
          <ul className="flag-list">
            {flags.map((f) => {
              let stem = ''
              try {
                const q = getQuestionByKey(f.questionKey)
                stem = q ? clip(q.stem, 40) : ''
              } catch {
                stem = ''
              }
              return (
                <li key={f.questionKey} className="flag-item">
                  <p className="flag-key">{f.questionKey}</p>
                  {stem && <p className="muted small">{stem}</p>}
                  <p>{f.memo || <span className="muted">（メモなし）</span>}</p>
                  <p className="muted small">{formatDateTime(f.at)}</p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeFlag(f.questionKey)}>
                    削除
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" className="btn btn-secondary" onClick={doExport}>
            JSONで書き出す
          </button>
        </>
      )}
    </section>
  )
}

function AboutSection() {
  return (
    <section className="card" aria-label="このアプリについて">
      <h2 className="card-title">このアプリについて</h2>
      <p>SPIトレーナー　バージョン {APP_VERSION}</p>
      <p className="muted">
        SPIは株式会社リクルートの登録商標です。本アプリは個人が作った非公式の練習アプリです。
      </p>
      <p className="muted small">
        問題はすべて自作で、本番の問題そのものではありません。アプリ内の点数や判定も、本番の評価とは別物の目安です。
      </p>
    </section>
  )
}
