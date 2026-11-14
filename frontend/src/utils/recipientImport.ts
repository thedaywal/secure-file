import { validateRecipientPassword, validateUsername } from '@/utils/policy'

/** One parsed recipient row from an uploaded credentials file. */
export interface ImportedRecipient {
  username: string
  password: string
  displayName?: string
}

/** A row that could not be imported, with a 1-based line number for the file. */
export interface RecipientImportIssue {
  line: number
  message: string
}

export interface ParsedRecipients {
  rows: ImportedRecipient[]
  issues: RecipientImportIssue[]
  /** Rows dropped because the same username appeared earlier in the file. */
  duplicateCount: number
}

const HEADER_CELLS = new Set([
  'username',
  'user',
  'user name',
  'login',
  'id',
  'password',
  'pass',
  'pwd',
  'displayname',
  'display name',
  'name',
])

function splitCells(line: string): string[] {
  const delimiter = line.includes(',')
    ? ','
    : line.includes('\t')
      ? '\t'
      : line.includes(';')
        ? ';'
        : null
  const cells = delimiter ? line.split(delimiter) : line.split(/\s+/)
  return cells.map((cell) => cell.trim().replace(/^["']+|["']+$/g, '').trim())
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some((cell) => HEADER_CELLS.has(cell.toLowerCase().replace(/\s+/g, ' ').trim()))
}

/**
 * Parse an uploaded credentials file into recipient rows.
 *
 * Accepts CSV, TSV or whitespace-separated text with an optional header row and
 * an optional third display-name column, in the order `username, password,
 * display name`. Invalid rows are reported rather than silently dropped, so the
 * administrator can fix the file and retry.
 */
export function parseRecipientsFile(text: string): ParsedRecipients {
  const rows: ImportedRecipient[] = []
  const issues: RecipientImportIssue[] = []
  const seen = new Set<string>()
  let duplicateCount = 0
  let headerChecked = false

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) return

    const cells = splitCells(trimmed)
    if (!headerChecked) {
      headerChecked = true
      if (looksLikeHeader(cells)) return
    }

    const [username = '', password = '', displayName] = cells
    const usernameProblem = validateUsername(username)
    const passwordProblem = validateRecipientPassword(password)
    if (usernameProblem || passwordProblem) {
      issues.push({ line, message: usernameProblem ?? passwordProblem ?? 'Invalid row.' })
      return
    }

    const key = username.trim()
    if (seen.has(key)) {
      duplicateCount += 1
      return
    }
    seen.add(key)
    rows.push({ username: key, password, displayName: displayName?.trim() || undefined })
  })

  return { rows, issues, duplicateCount }
}

/** Builds the downloadable template the administrator fills in. */
export function buildRecipientsTemplate(): string {
  return ['username,password,display name', '1234567890,0987654321,Amara Okafor', ''].join('\n')
}

export interface ExportedLink {
  username: string
  url: string
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Serializes the freshly issued links so they can be distributed at once. */
export function buildLinksCsv(links: ExportedLink[]): string {
  const lines = ['username,link', ...links.map((link) => [link.username, link.url].map(csvCell).join(','))]
  return lines.join('\n')
}
