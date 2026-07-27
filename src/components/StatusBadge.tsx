import { STATUS_LABEL, type ItemStatus } from '../types'

export function StatusBadge({ status }: { status: ItemStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
}
