type ComboboxProps = {
  id: string
  value: string
  options: string[]
  placeholder?: string
  onChange: (value: string) => void
  onBlurNormalize?: (value: string) => string
}

/** 入力可能なプルダウン（datalist） */
export function Combobox({
  id,
  value,
  options,
  placeholder,
  onChange,
  onBlurNormalize,
}: ComboboxProps) {
  const listId = `${id}-list`

  return (
    <>
      <input
        id={id}
        list={listId}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!onBlurNormalize) return
          const next = onBlurNormalize(value)
          if (next !== value) onChange(next)
        }}
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </>
  )
}
