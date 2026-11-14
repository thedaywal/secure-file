import {
  Ban,
  Eye,
  MoreVertical,
  Radio,
  Share2,
  SlidersHorizontal,
  Trash2,
  Users,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import {
  Badge,
  Dropdown,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/common'
import { FileTypeIcon } from '@/components/files/FileTypeIcon'
import { ProtectionStatusBadge } from '@/components/security/SecurityBadges'
import { adminPath } from '@/routes/navigation'
import { formatBytes, formatDate, formatUntil, isExpired } from '@/utils/format'
import type { SecureFile } from '@/types'
import type { ToneIntent } from '@/utils/labels'

function expirationMeta(expiresAt: string | null | undefined): { label: string; tone: ToneIntent } {
  if (!expiresAt) return { label: 'No expiration', tone: 'neutral' }
  if (isExpired(expiresAt)) return { label: 'Expired', tone: 'danger' }
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000
  return { label: formatUntil(expiresAt), tone: days < 7 ? 'warning' : 'neutral' }
}

export interface FileRowActionsProps {
  file: SecureFile
  onRevoke: (file: SecureFile) => void
  onDelete: (file: SecureFile) => void
}

export function FileRowActions({ file, onRevoke, onDelete }: FileRowActionsProps) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center gap-1">
      <IconButton
        label={`Delete file ${file.name}`}
        size="sm"
        variant="ghost"
        className="text-danger-600 hover:bg-danger-50"
        onClick={() => onDelete(file)}
      >
        <Trash2 size={15} />
      </IconButton>
      <Dropdown
        align="right"
        trigger={({ toggle }) => (
          <IconButton label="File actions" size="sm" onClick={toggle}>
            <MoreVertical size={16} />
          </IconButton>
        )}
        items={[
          {
            id: 'view',
            label: 'View details',
            icon: <Eye size={15} />,
            onSelect: () => navigate(adminPath(`/files/${file.id}`)),
          },
          {
            id: 'permissions',
            label: 'Configure permissions',
            icon: <SlidersHorizontal size={15} />,
            onSelect: () => navigate(adminPath(`/files/${file.id}?tab=policies`)),
          },
          {
            id: 'share',
            label: 'Share file',
            icon: <Share2 size={15} />,
            onSelect: () => navigate(adminPath(`/files/${file.id}?tab=sharing`)),
          },
          {
            id: 'activity',
            label: 'View access history',
            icon: <Radio size={15} />,
            onSelect: () => navigate(adminPath(`/monitoring/files/${file.id}`)),
          },
          {
            id: 'revoke',
            label: 'Revoke access',
            icon: <Ban size={15} />,
            tone: 'danger',
            separated: true,
            onSelect: () => onRevoke(file),
          },
        ]}
      />
    </div>
  )
}

export interface FileTableProps {
  files: SecureFile[]
  onRevoke: (file: SecureFile) => void
  onDelete: (file: SecureFile) => void
}

/** Desktop table — scrolls horizontally inside the card. */
export function FileTable({ files, onRevoke, onDelete }: FileTableProps) {
  return (
    <Table>
      <TableHead>
        <TableHeaderCell>File</TableHeaderCell>
        <TableHeaderCell>Size</TableHeaderCell>
        <TableHeaderCell>Uploaded</TableHeaderCell>
        <TableHeaderCell>Protection</TableHeaderCell>
        <TableHeaderCell>Recipients</TableHeaderCell>
        <TableHeaderCell>Expiration</TableHeaderCell>
        <TableHeaderCell align="right">Actions</TableHeaderCell>
      </TableHead>
      <TableBody>
        {files.map((file) => {
          const expiry = expirationMeta(file.expiresAt)
          return (
            <TableRow key={file.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <FileTypeIcon extension={file.extension} size="md" />
                  <div className="min-w-0">
                    <Link
                      to={adminPath(`/files/${file.id}`)}
                      className="block max-w-[240px] truncate text-[13.5px] font-medium text-ink transition-colors hover:text-brand-600"
                    >
                      {file.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone="neutral" size="sm">
                        {file.extension}
                      </Badge>
                      {(file.tags ?? []).slice(0, 3).map((tag) => (
                        <Badge key={tag} tone="neutral" size="sm">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatBytes(file.sizeBytes)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(file.uploadedAt)}</TableCell>
              <TableCell>
                <ProtectionStatusBadge status={file.protectionStatus} />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5 text-ink-soft">
                  <Users size={14} className="text-ink-muted" aria-hidden />
                  {file.authorizedRecipients}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <Badge tone={expiry.tone} size="sm">
                  {expiry.label}
                </Badge>
              </TableCell>
              <TableCell align="right">
                <div className="flex justify-end">
                  <FileRowActions file={file} onRevoke={onRevoke} onDelete={onDelete} />
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** Mobile card list — same data as the table for small screens. */
export function FileMobileList({ files, onRevoke, onDelete }: FileTableProps) {
  return (
    <ul className="divide-y divide-line">
      {files.map((file) => {
        const expiry = expirationMeta(file.expiresAt)
        return (
          <li key={file.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <FileTypeIcon extension={file.extension} size="md" />
                <div className="min-w-0">
                  <Link
                    to={adminPath(`/files/${file.id}`)}
                    className="block truncate text-[13.5px] font-medium text-ink"
                  >
                    {file.name}
                  </Link>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    {formatBytes(file.sizeBytes)} · {formatDate(file.uploadedAt)}
                  </p>
                </div>
              </div>
              <FileRowActions file={file} onRevoke={onRevoke} onDelete={onDelete} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <ProtectionStatusBadge status={file.protectionStatus} />
              <Badge tone="neutral" size="sm">
                <Users size={12} aria-hidden />
                {file.authorizedRecipients}
              </Badge>
              <Badge tone={expiry.tone} size="sm">
                {expiry.label}
              </Badge>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
