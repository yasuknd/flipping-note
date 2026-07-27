import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  calcBreakEvenPrice,
  calcEffectiveCost,
  calcFee,
  calcProfit,
  calcProfitRate,
  calcRecommendedPrice,
  formatPercent,
  formatYen,
  formatYenPlain,
  todayISO,
} from '../calc'
import { Combobox } from '../components/Combobox'
import { Field, Metric, Section } from '../components/Field'
import { MoneyInput } from '../components/MoneyInput'
import { COLOR_PRESETS, SIZE_PRESETS } from '../constants'
import { useItems } from '../ItemsContext'
import { normalizeColor, normalizeDisplayText, normalizeSize } from '../normalize'
import { useSettings } from '../SettingsContext'
import { uniqueSorted } from '../storage'
import {
  EMPTY_ITEM_INPUT,
  STATUS_LABEL,
  STATUS_ORDER,
  type ItemInput,
  type ItemStatus,
} from '../types'

/** 数値フォーム値 ↔ MoneyInput の生文字列 */
function numToRaw(value: number): string {
  return value ? String(value) : ''
}
function rawToNum(raw: string): number {
  return raw === '' ? 0 : Number(raw)
}

function toOptionalNumber(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toFormState(item: {
  brand: string
  name: string
  color: string
  size: string
  modelNumber: string
  source: string
  purchasePrice: number
  discount: number
  purchaseShipping: number
  purchaseDate: string
  memo: string
  marketplace: string
  feeRatePercent: number
  saleShipping: number
  salePrice: number | null
  soldDate: string
  status: ItemStatus
  pointsNote: string
}): ItemInput {
  return {
    brand: item.brand,
    name: item.name,
    color: item.color,
    size: item.size,
    modelNumber: item.modelNumber,
    source: item.source,
    purchasePrice: item.purchasePrice,
    discount: item.discount,
    purchaseShipping: item.purchaseShipping,
    purchaseDate: item.purchaseDate,
    memo: item.memo,
    marketplace: item.marketplace,
    feeRatePercent: item.feeRatePercent,
    saleShipping: item.saleShipping,
    salePrice: item.salePrice,
    soldDate: item.soldDate,
    status: item.status,
    pointsNote: item.pointsNote,
  }
}

export function ItemFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const { items, save, remove } = useItems()
  const { settings } = useSettings()
  const existing = !isNew ? items.find((item) => item.id === id) : undefined

  const [form, setForm] = useState<ItemInput>(() => {
    if (existing) return toFormState(existing)
    return {
      ...EMPTY_ITEM_INPUT,
      purchaseDate: todayISO(),
      feeRatePercent: settings.marketplaces[0]?.feeRatePercent ?? 10,
      marketplace: settings.marketplaces[0]?.name ?? '',
    }
  })
  const [salePriceText, setSalePriceText] = useState(
    existing?.salePrice != null ? String(existing.salePrice) : '',
  )
  const [message, setMessage] = useState('')

  const brandOptions = useMemo(
    () => uniqueSorted(items.map((item) => item.brand)),
    [items],
  )
  const nameOptions = useMemo(
    () => uniqueSorted(items.map((item) => item.name)),
    [items],
  )
  const sourceOptions = useMemo(
    () => uniqueSorted(items.map((item) => item.source)),
    [items],
  )
  const colorOptions = COLOR_PRESETS
  const sizeOptions = SIZE_PRESETS

  const selectedPresetId = useMemo(() => {
    const match = settings.marketplaces.find(
      (m) =>
        m.name === form.marketplace && m.feeRatePercent === form.feeRatePercent,
    )
    return match?.id ?? ''
  }, [settings.marketplaces, form.marketplace, form.feeRatePercent])

  useEffect(() => {
    if (!isNew && !existing) {
      navigate('/', { replace: true })
      return
    }
    if (existing) {
      setForm(toFormState(existing))
      setSalePriceText(existing.salePrice != null ? String(existing.salePrice) : '')
      return
    }
    setForm({
      ...EMPTY_ITEM_INPUT,
      purchaseDate: todayISO(),
      feeRatePercent: settings.marketplaces[0]?.feeRatePercent ?? 10,
      marketplace: settings.marketplaces[0]?.name ?? '',
    })
    setSalePriceText('')
    setMessage('')
    // settings は新規オープン時の初期値にだけ使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, isNew, navigate, id])

  const effectiveCost = useMemo(
    () => calcEffectiveCost(form.purchasePrice, form.discount, form.purchaseShipping),
    [form.purchasePrice, form.discount, form.purchaseShipping],
  )

  const breakEven = useMemo(
    () => calcBreakEvenPrice(effectiveCost, form.saleShipping, form.feeRatePercent),
    [effectiveCost, form.saleShipping, form.feeRatePercent],
  )

  const recommended = useMemo(
    () =>
      calcRecommendedPrice(
        effectiveCost,
        form.saleShipping,
        form.feeRatePercent,
        settings.minProfit,
      ),
    [effectiveCost, form.saleShipping, form.feeRatePercent, settings.minProfit],
  )

  const salePrice = toOptionalNumber(salePriceText)
  const fee = salePrice != null ? calcFee(salePrice, form.feeRatePercent) : null
  const profit =
    salePrice != null
      ? calcProfit(salePrice, form.feeRatePercent, form.saleShipping, effectiveCost)
      : null
  const profitRate =
    salePrice != null && profit != null ? calcProfitRate(profit, salePrice) : null

  function update<K extends keyof ItemInput>(key: K, value: ItemInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function applyRecommended() {
    if (recommended == null) return
    setSalePriceText(String(recommended))
  }

  function handleMarketplaceSelect(presetId: string) {
    const preset = settings.marketplaces.find((m) => m.id === presetId)
    if (!preset) return
    setForm((prev) => ({
      ...prev,
      marketplace: preset.name,
      feeRatePercent: preset.feeRatePercent,
    }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setMessage('商品名を入力してください')
      return
    }

    if (
      (form.status === 'sold' || form.status === 'completed') &&
      (salePrice == null || !form.soldDate)
    ) {
      setMessage('取引中・取引完了にするには販売価格と売却日が必要です')
      return
    }

    const payload: ItemInput = {
      ...form,
      salePrice,
      brand: normalizeDisplayText(form.brand),
      name: normalizeDisplayText(form.name),
      color: normalizeColor(form.color),
      size: normalizeSize(form.size),
      modelNumber: form.modelNumber.trim(),
      source: form.source.trim(),
      marketplace: form.marketplace.trim(),
      memo: form.memo.trim(),
      pointsNote: form.pointsNote.trim(),
    }

    const saved = await save(isNew ? null : (id ?? null), payload)
    setMessage('保存しました')
    if (isNew) {
      navigate(`/items/${saved.id}`, { replace: true })
    }
  }

  async function handleDelete() {
    if (!id || isNew) return
    if (!window.confirm('この商品を削除しますか？')) return
    await remove(id)
    navigate('/')
  }

  return (
    <div className="page">
      <div className="page-heading row">
        <div>
          <Link to="/" className="back-link">
            ← 一覧
          </Link>
          <h1>{isNew ? '新規登録' : '商品詳細'}</h1>
          <p className="muted">販売価格は最後に入力。途中でも保存できます。</p>
        </div>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <Section title="仕入れ情報">
          <Field label="ブランド" hint="英語は半角・頭文字大文字に自動調整">
            <Combobox
              id="brand"
              value={form.brand}
              options={brandOptions}
              placeholder="例: Uniqlo"
              onChange={(v) => update('brand', v)}
              onBlurNormalize={normalizeDisplayText}
            />
          </Field>
          <Field label="商品名" hint="英語は半角・頭文字大文字に自動調整">
            <Combobox
              id="name"
              value={form.name}
              options={nameOptions}
              placeholder="例: Wool Coat"
              onChange={(v) => update('name', v)}
              onBlurNormalize={normalizeDisplayText}
            />
          </Field>

          <div className="grid-3">
            <Field label="カラー">
              <select
                id="color"
                value={form.color}
                onChange={(e) => update('color', normalizeColor(e.target.value))}
              >
                <option value="">選択してください</option>
                {colorOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="サイズ">
              <select
                id="size"
                value={form.size}
                onChange={(e) => update('size', normalizeSize(e.target.value))}
              >
                <option value="">選択してください</option>
                {sizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="型番">
              <input
                value={form.modelNumber}
                onChange={(e) => update('modelNumber', e.target.value)}
                placeholder="任意"
                autoComplete="off"
              />
            </Field>
          </div>

          <Field label="仕入元">
            <Combobox
              id="source"
              value={form.source}
              options={sourceOptions}
              placeholder="例: オフモール"
              onChange={(v) => update('source', v)}
            />
          </Field>
          <div className="grid-2">
            <Field label="仕入価格（税込）">
              <MoneyInput
                id="purchasePrice"
                value={numToRaw(form.purchasePrice)}
                onChange={(raw) => update('purchasePrice', rawToNum(raw))}
                placeholder="0"
              />
            </Field>
            <Field label="割引（円）" hint="ポイント利用など">
              <MoneyInput
                id="discount"
                value={numToRaw(form.discount)}
                onChange={(raw) => update('discount', rawToNum(raw))}
                placeholder="0"
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="仕入れ送料（税込）">
              <MoneyInput
                id="purchaseShipping"
                value={numToRaw(form.purchaseShipping)}
                onChange={(raw) => update('purchaseShipping', rawToNum(raw))}
                placeholder="0"
              />
            </Field>
            <Field label="仕入日">
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => update('purchaseDate', e.target.value)}
              />
            </Field>
          </div>
          <Metric label="実質仕入価格" value={formatYen(effectiveCost)} emphasis="neutral" />
        </Section>

        <Section title="販売情報（価格決定）" accent>
          <div className="hero-metrics">
            <Metric
              label="損益分岐点（利益ゼロ）"
              value={breakEven == null ? '—' : formatYen(breakEven)}
              emphasis="neutral"
            />
            <Metric
              label={`推奨販売価格（利益${formatYenPlain(settings.minProfit)}以上）`}
              value={recommended == null ? '—' : formatYen(recommended)}
              emphasis="positive"
            />
          </div>
          <p className="muted tight">
            推奨価格は設定の最低利益を反映し、100円単位で切り上げます。
            <Link to="/settings" className="inline-link">
              設定を変更
            </Link>
          </p>
          {recommended != null ? (
            <button type="button" className="btn btn-ghost" onClick={applyRecommended}>
              推奨価格を販売価格に入れる
            </button>
          ) : null}

          <Field
            label="販売先"
            hint={
              settings.marketplaces.length === 0
                ? '先に設定で販売先を登録してください'
                : '設定した販売先＋手数料率を選択'
            }
          >
            <select
              value={selectedPresetId}
              onChange={(e) => handleMarketplaceSelect(e.target.value)}
              disabled={settings.marketplaces.length === 0}
            >
              <option value="">選択してください</option>
              {settings.marketplaces.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（手数料 {m.feeRatePercent}%）
                </option>
              ))}
            </select>
          </Field>

          <div className="grid-2">
            <Field label="販売手数料率（%）" hint="販売先選択で自動入力">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={99}
                step={0.1}
                value={form.feeRatePercent || ''}
                readOnly
                className="input-readonly"
              />
            </Field>
            <Field label="販売送料（税込）">
              <MoneyInput
                id="saleShipping"
                value={numToRaw(form.saleShipping)}
                onChange={(raw) => update('saleShipping', rawToNum(raw))}
                placeholder="0"
              />
            </Field>
          </div>
          <Field label="ステータス">
            <select
              value={form.status}
              onChange={(e) => update('status', e.target.value as ItemStatus)}
            >
              {STATUS_ORDER.map((key) => (
                <option key={key} value={key}>
                  {STATUS_LABEL[key]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="売却日" hint="取引中・取引完了の集計に使用">
            <input
              type="date"
              value={form.soldDate}
              onChange={(e) => update('soldDate', e.target.value)}
            />
          </Field>
        </Section>

        <Section title="販売価格（最後に入力）">
          <Field label="販売価格（税込）" hint="未入力のまま保存できます">
            <MoneyInput
              id="salePrice"
              value={salePriceText}
              onChange={setSalePriceText}
              placeholder="例: 4,800"
            />
          </Field>
          <Metric label="販売手数料" value={fee == null ? '—' : formatYen(fee)} />
          <div className="grid-2">
            <Metric
              label="利益"
              value={profit == null ? '—' : formatYen(profit)}
              emphasis={
                profit == null ? 'neutral' : profit >= 0 ? 'positive' : 'negative'
              }
            />
            <Metric
              label="利益率"
              value={formatPercent(profitRate)}
              emphasis={
                profitRate == null
                  ? 'neutral'
                  : profitRate >= 0
                    ? 'positive'
                    : 'negative'
              }
            />
          </div>
          <Field label="メモ">
            <textarea
              rows={3}
              value={form.memo}
              onChange={(e) => update('memo', e.target.value)}
              placeholder="任意"
            />
          </Field>
        </Section>

        {message ? <p className="form-message">{message}</p> : null}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-block">
            保存
          </button>
          {!isNew ? (
            <button type="button" className="btn btn-danger btn-block" onClick={handleDelete}>
              削除
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
