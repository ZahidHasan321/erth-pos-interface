import { Fragment } from 'react'
import type {
  Card2HashwaCode,
  Card2LineItem,
  Card2SidePocketCarryItem,
} from '../types'
import checkboxIcon from '../assets/checkbox.svg'
import checkboxMarkedIcon from '../assets/checkbox_marked.svg'
import { formatValue } from '../formatters/card2Formatters'
import { card2Layout } from '../layout'
import {
  resolveStyleOptionIconUrl,
  type Card2StyleGroupId,
} from '../catalogs/styleIconAssetMapHtml'

export interface Card2LineItemStyleMatrixTableHtmlProps {
  lineItems: readonly Card2LineItem[]
}

type FixedColumnDefinition = (typeof card2Layout.lineItemsTable.fixedColumns)[number]
type FixedColumnId = FixedColumnDefinition['id']

interface StyleGroupColumns {
  id: Card2StyleGroupId
  title: string
  optionIds: readonly string[]
}

const EMPTY_STYLE_OPTION_ID = '__empty__'
const hashwaCodes: readonly Card2HashwaCode[] = ['S', 'D', 'T', 'N']
const sidePocketItems: readonly Card2SidePocketCarryItem[] = ['mobile', 'wallet']

const resolveLineItemStyleSelection = (
  lineItem: Card2LineItem,
  groupId: Card2StyleGroupId,
): { id?: string; properties?: Record<string, unknown> } | undefined =>
  lineItem.style?.[groupId] as
    | { id?: string; properties?: Record<string, unknown> }
    | undefined

const normalizeOptionId = (id: string | undefined): string | undefined => {
  if (!id) return undefined
  const trimmed = id.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const resolveLineItemSelectedStyleIds = (
  lineItem: Card2LineItem,
  groupId: Card2StyleGroupId,
): readonly string[] => {
  const ids: string[] = []
  const primary = normalizeOptionId(
    resolveLineItemStyleSelection(lineItem, groupId)?.id,
  )
  if (primary) ids.push(primary)

  if (groupId === 'jabzoor') {
    const secondary = normalizeOptionId(
      (lineItem.style?.jabzoor2 as { id?: string } | undefined)?.id,
    )
    if (secondary && secondary !== primary) ids.push(secondary)
  }

  return ids
}

const resolveLineItemHashwa = (
  lineItem: Card2LineItem,
  groupId: Card2StyleGroupId,
): Card2HashwaCode | undefined => {
  const selection = resolveLineItemStyleSelection(lineItem, groupId)
  const hashwa = selection?.properties?.hashwa

  if (typeof hashwa !== 'string') {
    return undefined
  }

  const normalizedHashwa = hashwa.toUpperCase() as Card2HashwaCode

  return hashwaCodes.includes(normalizedHashwa) ? normalizedHashwa : undefined
}

const resolveLineItemCarryItems = (
  lineItem: Card2LineItem,
): readonly Card2SidePocketCarryItem[] => {
  const selection = resolveLineItemStyleSelection(lineItem, 'sidePocket')
  const carryItems = selection?.properties?.carryItems

  if (!Array.isArray(carryItems)) {
    return []
  }

  return sidePocketItems.filter((carryItem) => carryItems.includes(carryItem))
}

const resolveLineItemHasPen = (lineItem: Card2LineItem): boolean | undefined => {
  const selection = resolveLineItemStyleSelection(lineItem, 'topPocket')
  const hasPen = selection?.properties?.hasPen

  return typeof hasPen === 'boolean' ? hasPen : undefined
}

const resolveHashwaDetail = (
  lineItem: Card2LineItem,
  groupId: Card2StyleGroupId,
): string | undefined => {
  const hashwa = resolveLineItemHashwa(lineItem, groupId)
  return hashwa ? `Hashwa: ${hashwa}` : undefined
}

const titleCase = (value: string): string =>
  value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value

const buildStyleMetaDetails = (
  lineItem: Card2LineItem,
  groupId: Card2StyleGroupId,
): readonly string[] => {
  const details: string[] = []

  if (groupId === 'jabzoor' || groupId === 'sleeveShape') {
    const hashwaDetail = resolveHashwaDetail(lineItem, groupId)

    if (hashwaDetail) {
      details.push(hashwaDetail)
    }

    return details
  }

  if (groupId === 'sidePocket') {
    const hashwaDetail = resolveHashwaDetail(lineItem, 'sidePocket')

    if (hashwaDetail) {
      details.push(hashwaDetail)
    }

    const carryItems = resolveLineItemCarryItems(lineItem)

    if (carryItems.length > 0) {
      details.push(...carryItems.map(titleCase))
    }

    return details
  }

  if (groupId === 'topPocket') {
    const hashwaDetail = resolveHashwaDetail(lineItem, 'topPocket')

    if (hashwaDetail) {
      details.push(hashwaDetail)
    }

    const hasPen = resolveLineItemHasPen(lineItem)

    if (hasPen === true) {
      details.push('Pen')
    }

    return details
  }

  return []
}

const buildStyleGroupColumns = (
  lineItems: readonly Card2LineItem[],
): readonly StyleGroupColumns[] =>
  card2Layout.lineItemsTable.styleGroups.map((group) => {
    const optionIdSet = new Set<string>()

    lineItems.forEach((lineItem) => {
      const selectedIds = resolveLineItemSelectedStyleIds(lineItem, group.id)
      selectedIds.forEach((selectedId) => optionIdSet.add(selectedId))
    })

    const optionIds = [...optionIdSet].sort((left, right) => left.localeCompare(right))

    return {
      id: group.id,
      title: group.title,
      optionIds: optionIds.length > 0 ? optionIds : [EMPTY_STYLE_OPTION_ID],
    }
  })

const resolveFixedColumnValue = (
  lineItem: Card2LineItem,
  columnId: FixedColumnId,
): string => {
  const fabric = lineItem.fabric

  switch (columnId) {
    case 'fabricType':
      return formatValue(fabric?.fabricType)
    case 'meters':
      return formatValue(fabric?.meters)
    case 'price':
      return formatValue(fabric?.price)
    case 'fabricSource':
      return formatValue(fabric?.source)
    case 'type':
      return formatValue(fabric?.type)
    case 'line':
      return formatValue(fabric?.line)
    default:
      return '-'
  }
}

const humanizeStyleOptionId = (optionId: string): string =>
  optionId
    .split(/[-_]/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')

interface StyleOptionHeaderProps {
  groupId: Card2StyleGroupId
  optionId: string
}

const StyleOptionHeader = ({ groupId, optionId }: StyleOptionHeaderProps) => {
  if (optionId === EMPTY_STYLE_OPTION_ID) {
    return <span className="card2-style-matrix__option-fallback">-</span>
  }

  const iconUrl = resolveStyleOptionIconUrl(groupId, optionId)

  if (!iconUrl) {
    return (
      <span className="card2-style-matrix__option-fallback">
        {humanizeStyleOptionId(optionId)}
      </span>
    )
  }

  return <img className="card2-style-matrix__icon" src={iconUrl} alt={optionId} />
}

export function Card2LineItemStyleMatrixTableHtml({
  lineItems,
}: Card2LineItemStyleMatrixTableHtmlProps) {
  const styleGroupColumns = buildStyleGroupColumns(lineItems)
  const fixedColumns = card2Layout.lineItemsTable.fixedColumns

  return (
    <div className="card2-style-matrix-wrapper">
      <table className="card2-style-matrix">
        <thead>
          <tr>
            {fixedColumns.map((column) => (
              <th
                key={`fixed-header-${column.id}`}
                style={{ width: `${column.widthPercent}%` }}
                rowSpan={2}
              >
                {column.title}
              </th>
            ))}

            {styleGroupColumns.map((group) => (
              <th
                key={`group-header-${group.id}`}
                className="card2-style-matrix__group-header"
                colSpan={group.optionIds.length}
              >
                {group.title}
              </th>
            ))}
          </tr>

          <tr>
            {styleGroupColumns.flatMap((group) =>
              group.optionIds.map((optionId) => (
                <th
                  key={`option-header-${group.id}-${optionId}`}
                  className="card2-style-matrix__option-header"
                >
                  <StyleOptionHeader groupId={group.id} optionId={optionId} />
                </th>
              )),
            )}
          </tr>
        </thead>

        <tbody>
          {lineItems.map((lineItem) => (
            <Fragment key={`line-item-row-group-${lineItem.lineNumber}`}>
              <tr className="card2-style-matrix__data-row" key={`line-item-${lineItem.lineNumber}`}>
                {fixedColumns.map((column) => (
                  <td key={`fixed-cell-${lineItem.lineNumber}-${column.id}`} rowSpan={2}>
                    {resolveFixedColumnValue(lineItem, column.id)}
                  </td>
                ))}

                {styleGroupColumns.flatMap((group) => {
                  const selectedOptionIds = resolveLineItemSelectedStyleIds(lineItem, group.id)

                  return group.optionIds.map((optionId) => {
                    const isChecked =
                      optionId !== EMPTY_STYLE_OPTION_ID && selectedOptionIds.includes(optionId)

                    return (
                      <td
                        className="card2-style-matrix__style-cell"
                        key={`style-cell-${lineItem.lineNumber}-${group.id}-${optionId}`}
                      >
                        <img
                          className="card2-style-matrix__checkbox-icon"
                          src={isChecked ? checkboxMarkedIcon : checkboxIcon}
                          alt=""
                          aria-hidden
                        />
                      </td>
                    )
                  })
                })}
              </tr>

              <tr className="card2-style-matrix__meta-row" key={`line-item-meta-${lineItem.lineNumber}`}>
                {styleGroupColumns.map((group) => {
                  const detailItems = buildStyleMetaDetails(lineItem, group.id)

                  return (
                    <td
                      className="card2-style-matrix__meta-cell"
                      colSpan={group.optionIds.length}
                      key={`meta-${lineItem.lineNumber}-${group.id}`}
                    >
                      {detailItems.length > 0 ? (
                        <span className="card2-style-matrix__meta-detail-list">
                          {detailItems.map((detailItem, detailIndex) => (
                            <span
                              className="card2-style-matrix__meta-chip"
                              key={`meta-chip-${lineItem.lineNumber}-${group.id}-${detailItem}-${detailIndex}`}
                            >
                              {detailItem}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="card2-style-matrix__meta-empty">-</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
