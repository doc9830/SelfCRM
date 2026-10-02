// Поле тегов клиента: выбранные теги видны сразу, новый добавляется кнопкой или Enter,
// а готовые подписи предлагаются чипами — «Оптовик» и «Должник» не нужно набирать руками.
import { useState } from 'react'
import {
  CLIENT_TAG_MAX_LENGTH,
  CLIENT_TAG_SUGGESTIONS,
  addClientTag,
  removeClientTag,
  sameClientTag,
} from '../utils/clients'
import { Icon } from './Icons'
import { Input } from './ui'

export function TagField({
  value,
  onChange,
}: {
  value: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const suggestions = CLIENT_TAG_SUGGESTIONS.filter(
    (tag) => !value.some((item) => sameClientTag(item, tag)),
  )

  const add = (tag: string) => {
    const next = addClientTag(value, tag)
    setDraft('')
    if (next.length !== value.length) onChange(next)
  }

  return (
    <div className="tag-field">
      {value.length > 0 && (
        <div className="tag-row">
          {value.map((tag) => (
            <span className="tag-pill" key={tag}>
              {tag}
              <button
                type="button"
                className="tag-remove"
                aria-label={`Убрать тег ${tag}`}
                onClick={() => onChange(removeClientTag(value, tag))}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="tag-input">
        <Input
          value={draft}
          maxLength={CLIENT_TAG_MAX_LENGTH}
          placeholder="Например, «Должник»"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter добавляет тег и не отправляет форму: тегов может быть несколько.
            if (event.key !== 'Enter') return
            event.preventDefault()
            add(draft)
          }}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!draft.trim()}
          onClick={() => add(draft)}
        >
          Добавить
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="tag-suggestions">
          {suggestions.map((tag) => (
            <button type="button" className="chip" key={tag} onClick={() => add(tag)}>
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
