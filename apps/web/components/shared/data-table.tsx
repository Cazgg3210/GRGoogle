'use client'

import * as React from 'react'
import { flexRender, type Table as TanstackTable } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@smlxl/ui'

export function DataTable<T>({
  table,
  emptyState,
  onRowClick,
  rowClassName,
  dense,
}: {
  table: TanstackTable<T>
  emptyState?: React.ReactNode
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  dense?: boolean
}) {
  const rows = table.getRowModel().rows
  const columns = table.getVisibleLeafColumns().length
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id} className="hover:bg-transparent">
            {hg.headers.map((header) => {
              const canSort = header.column.getCanSort()
              const sorted = header.column.getIsSorted()
              const size = header.column.columnDef.size
              return (
                <TableHead
                  key={header.id}
                  style={size ? { width: size } : undefined}
                  className={cn(canSort && 'cursor-pointer select-none')}
                  onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                >
                  {header.isPlaceholder ? null : (
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort ? (
                        sorted === 'asc' ? (
                          <ArrowUp className="size-3" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )
                      ) : null}
                    </span>
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columns} className="p-0">
              {emptyState ?? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Sin resultados.
                </p>
              )}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className={cn(dense && 'py-1.5')}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
