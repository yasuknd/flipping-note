type MoneyInputProps = {
  id?: string
  /** 数値の生文字列（空文字は未入力） */
  value: string
  onChange: (rawDigits: string) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

function formatDigits(digits: string): string {
  if (digits === '') return ''
  return Number(digits).toLocaleString('ja-JP')
}

/** 3桁カンマ表示の金額入力 */
export function MoneyInput({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  autoFocus,
}: MoneyInputProps) {
  return (
    <div className={`money-input ${className ?? ''}`}>
      <span className="money-mark" aria-hidden="true">
        ¥
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={formatDigits(value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={onBlur}
      />
    </div>
  )
}
